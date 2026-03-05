import { ChromaClient, Collection } from 'chromadb';
import { eq } from 'drizzle-orm';
import { transcriptSegments, chapters, videos } from '../db/schema.js';
import type { EmbeddingService } from './embedding.js';

type Db = Awaited<ReturnType<typeof import('../db/index.js').getDb>>;

// Approximate token count: 1 token ≈ 4 characters
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface TranscriptSegment {
  id: string;
  segmentIndex: number;
  startTime: number;
  endTime: number;
  text: string;
  language: string;
}

export interface Chapter {
  id: string;
  chapterIndex: number;
  title: string;
  startTime: number;
  endTime: number;
}

export interface TranscriptChunk {
  text: string;
  startTime: number;
  endTime: number;
  chapterTitle: string;
  segmentIndices: number[];
}

export interface QueryOptions {
  topK?: number;
  videoId?: string;
}

export interface QueryResult {
  chunkId: string;
  text: string;
  distance: number;
  metadata: {
    video_id: string;
    video_title: string;
    start_time: number;
    end_time: number;
    chapter_title: string;
    segment_indices: string;
  };
}

const COLLECTION_NAME = 'video_transcripts';
const DEFAULT_BATCH_SIZE = 32;

export class VectorStoreService {
  private db: Db;
  private embeddingService: EmbeddingService;
  private chroma: ChromaClient;
  private collection: Collection | null = null;
  private chunkSize: number;
  private chunkOverlap: number;
  private batchSize: number;

  constructor(
    db: Db,
    embeddingService: EmbeddingService,
    chromaUrl: string,
    chunkSize = 400,
    chunkOverlap = 50,
    batchSize = DEFAULT_BATCH_SIZE
  ) {
    this.db = db;
    this.embeddingService = embeddingService;
    this.chroma = new ChromaClient({ path: chromaUrl });
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
    this.batchSize = batchSize;
  }

  async initialize(): Promise<void> {
    this.collection = await this.chroma.getOrCreateCollection({ name: COLLECTION_NAME });
  }

  private getCollection(): Collection {
    if (!this.collection) {
      throw new Error('VectorStoreService not initialized — call initialize() first');
    }
    return this.collection;
  }

  /**
   * Groups consecutive transcript segments into chunks of ~chunkSize tokens
   * with chunkOverlap token overlap, respecting chapter boundaries.
   */
  chunkTranscript(segments: TranscriptSegment[], chapterList: Chapter[]): TranscriptChunk[] {
    if (segments.length === 0) return [];

    // Sort inputs by index/startTime
    const sortedSegments = segments.slice().sort((a, b) => a.segmentIndex - b.segmentIndex);
    const sortedChapters = chapterList.slice().sort((a, b) => a.chapterIndex - b.chapterIndex);

    // Assign chapter title to each segment
    const segmentChapterTitle = (seg: TranscriptSegment): string => {
      // Find the last chapter whose startTime <= segment startTime
      let title = '';
      for (const ch of sortedChapters) {
        if (ch.startTime <= seg.startTime) {
          title = ch.title;
        }
      }
      return title;
    };

    // Group segments by chapter boundary
    const chapterGroups: TranscriptSegment[][] = [];
    let currentGroup: TranscriptSegment[] = [];
    let currentChapterTitle = '';

    for (const seg of sortedSegments) {
      const chTitle = segmentChapterTitle(seg);
      if (currentGroup.length > 0 && chTitle !== currentChapterTitle) {
        chapterGroups.push(currentGroup);
        currentGroup = [];
      }
      currentChapterTitle = chTitle;
      currentGroup.push(seg);
    }
    if (currentGroup.length > 0) chapterGroups.push(currentGroup);

    const chunks: TranscriptChunk[] = [];

    for (const group of chapterGroups) {
      const chTitle = segmentChapterTitle(group[0]);
      chunks.push(...this.chunkGroup(group, chTitle));
    }

    return chunks;
  }

  private chunkGroup(segments: TranscriptSegment[], chapterTitle: string): TranscriptChunk[] {
    const chunks: TranscriptChunk[] = [];
    let startIdx = 0;

    while (startIdx < segments.length) {
      const chunkSegments: TranscriptSegment[] = [];
      let tokenCount = 0;

      for (let i = startIdx; i < segments.length; i++) {
        const segTokens = estimateTokens(segments[i].text);
        if (chunkSegments.length > 0 && tokenCount + segTokens > this.chunkSize) break;
        chunkSegments.push(segments[i]);
        tokenCount += segTokens;
      }

      if (chunkSegments.length === 0) {
        // Single segment exceeds chunk size — include it alone to avoid infinite loop
        chunkSegments.push(segments[startIdx]);
      }

      chunks.push({
        text: chunkSegments.map((s) => s.text).join(' '),
        startTime: chunkSegments[0].startTime,
        endTime: chunkSegments[chunkSegments.length - 1].endTime,
        chapterTitle,
        segmentIndices: chunkSegments.map((s) => s.segmentIndex),
      });

      // Advance start by (chunkSegments.length - overlapSegments)
      const overlapTokenTarget = this.chunkOverlap;
      let overlapSegCount = 0;
      let overlapTokens = 0;
      for (let i = chunkSegments.length - 1; i >= 0; i--) {
        overlapTokens += estimateTokens(chunkSegments[i].text);
        overlapSegCount++;
        if (overlapTokens >= overlapTokenTarget) break;
      }

      const advance = Math.max(1, chunkSegments.length - overlapSegCount);
      startIdx += advance;
    }

    return chunks;
  }

  async storeVideoEmbeddings(videoId: string): Promise<void> {
    const collection = this.getCollection();

    // Load video metadata
    const [video] = await this.db.select().from(videos).where(eq(videos.id, videoId));
    if (!video) throw new Error(`Video not found: ${videoId}`);

    // Load segments and chapters
    const segments = await this.db
      .select()
      .from(transcriptSegments)
      .where(eq(transcriptSegments.videoId, videoId));
    const chapterRows = await this.db
      .select()
      .from(chapters)
      .where(eq(chapters.videoId, videoId));

    const chunks = this.chunkTranscript(segments, chapterRows);
    if (chunks.length === 0) return;

    // Process in batches
    for (let batchStart = 0; batchStart < chunks.length; batchStart += this.batchSize) {
      const batchChunks = chunks.slice(batchStart, batchStart + this.batchSize);
      const texts = batchChunks.map((c) => c.text);
      const embeddings = await this.embeddingService.embedTexts(texts);

      const ids = batchChunks.map((_, i) => `${videoId}_${batchStart + i}`);
      const metadatas = batchChunks.map((c) => ({
        video_id: videoId,
        video_title: video.title,
        start_time: c.startTime,
        end_time: c.endTime,
        chapter_title: c.chapterTitle,
        segment_indices: JSON.stringify(c.segmentIndices),
      }));

      await collection.add({
        ids,
        documents: texts,
        embeddings,
        metadatas,
      });
    }
  }

  async deleteVideoEmbeddings(videoId: string): Promise<void> {
    const collection = this.getCollection();
    await collection.delete({ where: { video_id: videoId } });
  }

  async queryByText(query: string, options: QueryOptions = {}): Promise<QueryResult[]> {
    const collection = this.getCollection();
    const topK = options.topK ?? 10;

    const [queryEmbedding] = await this.embeddingService.embedTexts([query]);

    const whereFilter = options.videoId ? { video_id: options.videoId } : undefined;

    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: topK,
      ...(whereFilter ? { where: whereFilter } : {}),
    });

    const ids = results.ids[0] ?? [];
    const documents = results.documents[0] ?? [];
    const distances = results.distances?.[0] ?? [];
    const metadatas = results.metadatas[0] ?? [];

    return ids.map((id, i) => ({
      chunkId: id,
      text: documents[i] ?? '',
      distance: distances[i] ?? 0,
      metadata: metadatas[i] as QueryResult['metadata'],
    }));
  }
}
