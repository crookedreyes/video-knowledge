import { eq, desc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { chatSessions, chatMessages, videos } from '../db/schema.js';
import { ChromaClient } from './chroma.js';
import type { EmbeddingService } from './embedding.js';
import type { LLMService, ChatCompletionMessageParam } from './llm.js';
import type { ConfigService } from './config.js';

type Db = Awaited<ReturnType<typeof import('../db/index.js').getDb>>;

export interface Citation {
  index: number;
  videoId: string;
  videoTitle: string;
  youtubeId: string;
  startTime: number;
  endTime: number;
  text: string;
}

export interface RetrievedChunk {
  text: string;
  videoId: string;
  videoTitle: string;
  youtubeId: string;
  startTime: number;
  endTime: number;
}

export type SSEEvent =
  | { event: 'retrieval'; data: { chunks: RetrievedChunk[] } }
  | { event: 'chunk'; data: { text: string } }
  | { event: 'citation'; data: Citation }
  | { event: 'done'; data: { messageId: string } }
  | { event: 'error'; data: { message: string } };

const SYSTEM_PROMPT = `You are a knowledgeable assistant that answers questions based on video transcripts.
Rules:
1. Base answers ONLY on the provided transcript excerpts.
2. Cite sources using [N] notation where N is the excerpt number.
3. If excerpts don't contain enough info, say so.
4. Include timestamps when referencing specific moments.
5. Be concise but thorough.`;

export class RAGService {
  private db: Db;
  private llmService: LLMService;
  private embeddingService: EmbeddingService;
  private configService: ConfigService;

  constructor(
    db: Db,
    llmService: LLMService,
    embeddingService: EmbeddingService,
    configService: ConfigService
  ) {
    this.db = db;
    this.llmService = llmService;
    this.embeddingService = embeddingService;
    this.configService = configService;
  }

  private getChromaClient(): ChromaClient {
    const port = this.configService.get<number>('chroma.port') ?? 8000;
    return new ChromaClient(port);
  }

  private formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  private parseChromaResults(
    results: {
      ids: string[][];
      documents: (string | null)[][];
      metadatas: (Record<string, string | number> | null)[][];
      distances: number[][];
    },
    videoId: string,
    videoTitle: string,
    youtubeId: string
  ): RetrievedChunk[] {
    const ids = results.ids[0] ?? [];
    const documents = results.documents[0] ?? [];
    const metadatas = results.metadatas[0] ?? [];

    return ids.map((_, i) => {
      const meta = metadatas[i] ?? {};
      return {
        text: (documents[i] ?? '') as string,
        videoId: (meta['videoId'] as string) ?? videoId,
        videoTitle: (meta['videoTitle'] as string) ?? videoTitle,
        youtubeId: (meta['youtubeId'] as string) ?? youtubeId,
        startTime: (meta['startTime'] as number) ?? 0,
        endTime: (meta['endTime'] as number) ?? 0,
      };
    });
  }

  async retrieve(query: string, sessionId: string): Promise<RetrievedChunk[]> {
    const sessions = await this.db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, sessionId))
      .limit(1);

    if (sessions.length === 0) throw new Error('Session not found');
    const session = sessions[0];

    const topK = this.configService.get<number>('rag.topK') ?? 10;

    try {
      const embedding = await this.embeddingService.embedSingle(query);
      const chroma = this.getChromaClient();

      if (session.scope === 'video' && session.videoId) {
        const videoRows = await this.db
          .select({
            chromaCollectionId: videos.chromaCollectionId,
            title: videos.title,
            youtubeId: videos.youtubeId,
          })
          .from(videos)
          .where(eq(videos.id, session.videoId))
          .limit(1);

        if (videoRows.length === 0 || !videoRows[0].chromaCollectionId) {
          return [];
        }

        const { chromaCollectionId, title, youtubeId } = videoRows[0];
        const results = await chroma.query(chromaCollectionId, embedding, topK);
        return this.parseChromaResults(results, session.videoId, title, youtubeId);
      } else {
        const allVideos = await this.db
          .select({
            id: videos.id,
            title: videos.title,
            youtubeId: videos.youtubeId,
            chromaCollectionId: videos.chromaCollectionId,
          })
          .from(videos)
          .where(eq(videos.status, 'ready'));

        const perVideoK = Math.max(3, Math.ceil(topK / Math.max(allVideos.length, 1)));
        const chunks: RetrievedChunk[] = [];

        await Promise.all(
          allVideos
            .filter((v) => v.chromaCollectionId)
            .map(async (v) => {
              try {
                const results = await chroma.query(v.chromaCollectionId!, embedding, perVideoK);
                chunks.push(...this.parseChromaResults(results, v.id, v.title, v.youtubeId));
              } catch {
                // Skip unavailable collections
              }
            })
        );

        return chunks.slice(0, topK);
      }
    } catch {
      return [];
    }
  }

  private buildMessages(
    query: string,
    chunks: RetrievedChunk[],
    history: Array<{ role: 'user' | 'assistant'; content: string }>
  ): ChatCompletionMessageParam[] {
    const excerpts = chunks
      .map(
        (c, i) =>
          `[${i + 1}] (${this.formatTime(c.startTime)} - ${this.formatTime(c.endTime)}) "${c.text}"`
      )
      .join('\n\n');

    const systemContent =
      chunks.length > 0
        ? `${SYSTEM_PROMPT}\n\nTranscript excerpts:\n${excerpts}`
        : `${SYSTEM_PROMPT}\n\nNo transcript excerpts were found for this query.`;

    return [
      { role: 'system', content: systemContent },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: query },
    ];
  }

  private parseCitations(text: string, chunks: RetrievedChunk[]): Citation[] {
    const seen = new Set<number>();
    const citations: Citation[] = [];
    const regex = /\[(\d+)\]/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const idx = parseInt(match[1], 10);
      if (idx >= 1 && idx <= chunks.length && !seen.has(idx)) {
        seen.add(idx);
        const chunk = chunks[idx - 1];
        citations.push({
          index: idx,
          videoId: chunk.videoId,
          videoTitle: chunk.videoTitle,
          youtubeId: chunk.youtubeId,
          startTime: chunk.startTime,
          endTime: chunk.endTime,
          text: chunk.text.slice(0, 100),
        });
      }
    }

    return citations.sort((a, b) => a.index - b.index);
  }

  async streamMessage(
    sessionId: string,
    userContent: string,
    messageId: string,
    onEvent: (event: SSEEvent) => Promise<void>
  ): Promise<void> {
    const historyRows = await this.db
      .select({ role: chatMessages.role, content: chatMessages.content })
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(20);

    // Reverse to chronological order; drop the last entry (current user msg already stored by caller)
    const history = historyRows.reverse().map((r) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
    }));
    const priorHistory = history.slice(0, -1);

    const chunks = await this.retrieve(userContent, sessionId);
    await onEvent({ event: 'retrieval', data: { chunks } });

    const messages = this.buildMessages(userContent, chunks, priorHistory);

    let fullText = '';
    try {
      for await (const chunk of this.llmService.stream(messages)) {
        fullText += chunk;
        await onEvent({ event: 'chunk', data: { text: chunk } });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'LLM streaming failed';
      await onEvent({ event: 'error', data: { message } });
    }

    const citations = this.parseCitations(fullText, chunks);
    for (const citation of citations) {
      await onEvent({ event: 'citation', data: citation });
    }

    await this.db.insert(chatMessages).values({
      id: messageId,
      sessionId,
      role: 'assistant',
      content: fullText,
      citations: citations.length > 0 ? JSON.stringify(citations) : null,
    });

    await this.db
      .update(chatSessions)
      .set({ updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(chatSessions.id, sessionId));

    await onEvent({ event: 'done', data: { messageId } });
  }
}
