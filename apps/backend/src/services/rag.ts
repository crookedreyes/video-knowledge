import { inArray, eq } from 'drizzle-orm';
import { videos, chatMessages } from '../db/schema.js';
import type { LLMService, ChatCompletionMessageParam } from './llm.js';
import type { EmbeddingService } from './embedding.js';
import type { VectorStoreService } from './vectorStore.js';
import type { ConfigService } from './config.js';
import type { getDb } from '../db/index.js';

type Db = Awaited<ReturnType<typeof getDb>>;

export interface RetrievedChunk {
  videoId: string;
  videoTitle: string;
  text: string;
  startTime: number;
  endTime: number;
  distance: number;
}

export interface Citation {
  index: number;
  videoId: string;
  videoTitle: string;
  startTime: number;
  text: string;
}

const SYSTEM_PROMPT = `You are a knowledgeable assistant that answers questions based on video transcripts.
Rules:
1. Base answers ONLY on the provided transcript excerpts.
2. Cite sources using [N] notation.
3. If excerpts don't contain enough info, say so.
4. Include timestamps when referencing specific moments.
5. Be concise but thorough.`;

const HISTORY_LIMIT = 10;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m${s.toString().padStart(2, '0')}s`;
}

export class RAGService {
  constructor(
    private llmService: LLMService,
    private embeddingService: EmbeddingService,
    private vectorStoreService: VectorStoreService,
    private configService: ConfigService,
    private db: Db,
  ) {}

  /**
   * Embed the query, retrieve top-K chunks from ChromaDB, and enrich with video titles.
   * If videoDbId is provided, filters to that video only.
   */
  async retrieve(
    query: string,
    scope: 'global' | 'video',
    videoDbId?: string,
  ): Promise<RetrievedChunk[]> {
    const topK = this.configService.get<number>('rag.topK') ?? 10;

    const queryEmbedding = await this.embeddingService.embedSingle(query);

    const videoIds = scope === 'video' && videoDbId ? [videoDbId] : undefined;
    const rawResults = await this.vectorStoreService.query(queryEmbedding, topK, videoIds);

    if (rawResults.length === 0) return [];

    // Enrich with video titles from SQLite
    const uniqueVideoIds = [...new Set(rawResults.map((r) => r.videoId))].filter(Boolean);
    const videoRows = await this.db
      .select({ id: videos.id, title: videos.title })
      .from(videos)
      .where(inArray(videos.id, uniqueVideoIds));

    const videoTitleMap = new Map(videoRows.map((v) => [v.id, v.title]));

    return rawResults.map((r) => ({
      videoId: r.videoId,
      videoTitle: videoTitleMap.get(r.videoId) ?? 'Unknown Video',
      text: r.text,
      startTime: r.startTime,
      endTime: r.endTime,
      distance: r.distance,
    }));
  }

  /**
   * Build the messages array for the LLM, including system prompt with sources,
   * chat history, and the user's question.
   */
  buildMessages(
    chunks: RetrievedChunk[],
    history: { role: 'user' | 'assistant'; content: string }[],
    userQuery: string,
  ): ChatCompletionMessageParam[] {
    let systemContent = SYSTEM_PROMPT;

    if (chunks.length > 0) {
      const sourceLines = chunks
        .map((chunk, i) => {
          const timeRange = `${formatTime(chunk.startTime)} - ${formatTime(chunk.endTime)}`;
          return `[${i + 1}] Video: "${chunk.videoTitle}" | Time: ${timeRange}\n${chunk.text}`;
        })
        .join('\n\n');
      systemContent += `\n\nSources:\n${sourceLines}`;
    } else {
      systemContent += '\n\nNo transcript excerpts available for this query.';
    }

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemContent },
      ...history.slice(-HISTORY_LIMIT),
      { role: 'user', content: userQuery },
    ];

    return messages;
  }

  /**
   * Parse [N] citation references from the assistant's response text.
   * Maps each unique [N] to the corresponding chunk's metadata.
   */
  parseCitations(text: string, chunks: RetrievedChunk[]): Citation[] {
    const seen = new Set<number>();
    const citations: Citation[] = [];

    for (const match of text.matchAll(/\[(\d+)\]/g)) {
      const n = parseInt(match[1], 10);
      if (seen.has(n)) continue;
      seen.add(n);

      const chunk = chunks[n - 1]; // 1-indexed
      if (!chunk) continue;

      citations.push({
        index: n,
        videoId: chunk.videoId,
        videoTitle: chunk.videoTitle,
        startTime: chunk.startTime,
        text: chunk.text,
      });
    }

    return citations;
  }

  /**
   * Load the last N messages from a chat session for history context.
   */
  async loadHistory(
    sessionId: string,
  ): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
    const rows = await this.db
      .select({ role: chatMessages.role, content: chatMessages.content })
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(chatMessages.createdAt)
      .limit(HISTORY_LIMIT);

    return rows as { role: 'user' | 'assistant'; content: string }[];
  }

  /**
   * Stream the LLM response as an async generator of text chunks.
   */
  stream(messages: ChatCompletionMessageParam[]): AsyncGenerator<string> {
    return this.llmService.stream(messages);
  }
}
