import { eq, asc } from 'drizzle-orm';
import { videos, transcriptSegments } from '../../../db/schema.js';
import type { PipelineContext } from '../types.js';
import { LLMClient } from '../../llm.js';
import { ChromaClient } from '../../chroma.js';

/**
 * Roughly estimate token count (1 token ≈ 4 chars).
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface Chunk {
  text: string;
  startTime: number;
  endTime: number;
  segmentIndexStart: number;
  segmentIndexEnd: number;
}

/**
 * Group transcript segments into ~chunkSize token chunks with overlap.
 */
function buildChunks(
  segs: Array<{ text: string; startTime: number; endTime: number; segmentIndex: number }>,
  chunkSize: number,
  overlap: number
): Chunk[] {
  const chunks: Chunk[] = [];
  let i = 0;

  while (i < segs.length) {
    const chunkSegs: typeof segs = [];
    let tokens = 0;
    let j = i;

    while (j < segs.length && tokens < chunkSize) {
      chunkSegs.push(segs[j]);
      tokens += estimateTokens(segs[j].text);
      j++;
    }

    if (chunkSegs.length === 0) break;

    chunks.push({
      text: chunkSegs.map((s) => s.text).join(' '),
      startTime: chunkSegs[0].startTime,
      endTime: chunkSegs[chunkSegs.length - 1].endTime,
      segmentIndexStart: chunkSegs[0].segmentIndex,
      segmentIndexEnd: chunkSegs[chunkSegs.length - 1].segmentIndex,
    });

    // Advance with overlap: step back by ~overlap tokens worth of segments
    const overlapTokenTarget = overlap;
    let backTokens = 0;
    let backIdx = j - 1;
    while (backIdx > i && backTokens < overlapTokenTarget) {
      backTokens += estimateTokens(segs[backIdx].text);
      backIdx--;
    }
    i = Math.max(i + 1, backIdx + 1);
  }

  return chunks;
}

/**
 * Step 4: Group segments into ~400-token chunks, embed via LM Studio, store in ChromaDB.
 * Idempotent: deletes and recreates the ChromaDB collection.
 */
export async function embedStep(ctx: PipelineContext): Promise<void> {
  ctx.emit({ videoId: ctx.videoId, step: 'embed', status: 'started' });

  const rows = await ctx.db
    .select({ youtubeId: videos.youtubeId, chromaCollectionId: videos.chromaCollectionId })
    .from(videos)
    .where(eq(videos.id, ctx.videoId))
    .limit(1);

  if (rows.length === 0) throw new Error(`Video not found: ${ctx.videoId}`);
  const { youtubeId } = rows[0];

  await ctx.db.update(videos).set({ status: 'embedding' }).where(eq(videos.id, ctx.videoId));

  const segs = await ctx.db
    .select({
      text: transcriptSegments.text,
      startTime: transcriptSegments.startTime,
      endTime: transcriptSegments.endTime,
      segmentIndex: transcriptSegments.segmentIndex,
    })
    .from(transcriptSegments)
    .where(eq(transcriptSegments.videoId, ctx.videoId))
    .orderBy(asc(transcriptSegments.segmentIndex));

  if (segs.length === 0) throw new Error(`No transcript segments for video ${ctx.videoId}`);

  const chunkSize = ctx.config.get<number>('rag.chunkSize') ?? 400;
  const overlap = ctx.config.get<number>('rag.chunkOverlap') ?? 50;
  const chunks = buildChunks(segs, chunkSize, overlap);

  ctx.emit({ videoId: ctx.videoId, step: 'embed', status: 'progress', message: `Embedding ${chunks.length} chunks` });

  const llm = new LLMClient({
    baseUrl: ctx.config.get<string>('llm.baseUrl') ?? 'http://localhost:1234/v1',
    apiKey: ctx.config.get<string>('llm.apiKey') ?? '',
    chatModel: ctx.config.get<string>('llm.chatModel') ?? 'qwen3.5',
    embeddingModel: ctx.config.get<string>('llm.embeddingModel') ?? 'qwen3-embedding',
    temperature: ctx.config.get<number>('llm.temperature') ?? 0.7,
    maxTokens: ctx.config.get<number>('llm.maxTokens') ?? 4096,
  });

  const chromaPort = ctx.config.get<number>('chroma.port') ?? 8000;
  const chroma = new ChromaClient(chromaPort);

  // Recreate collection (idempotent via get_or_create)
  const collectionName = `video-${youtubeId}`;
  const collectionId = await chroma.getOrCreateCollection(collectionName);

  // Embed in batches of 32
  const BATCH = 32;
  const allEmbeddings: number[][] = [];
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const embeddings = await llm.embed(batch.map((c) => c.text));
    allEmbeddings.push(...embeddings);
    ctx.emit({
      videoId: ctx.videoId,
      step: 'embed',
      status: 'progress',
      message: `Embedded ${Math.min(i + BATCH, chunks.length)}/${chunks.length} chunks`,
    });
  }

  // Upsert into ChromaDB
  await chroma.upsert(collectionId, {
    ids: chunks.map((_, i) => `${ctx.videoId}-chunk-${i}`),
    embeddings: allEmbeddings,
    documents: chunks.map((c) => c.text),
    metadatas: chunks.map((c) => ({
      videoId: ctx.videoId,
      youtubeId,
      startTime: c.startTime,
      endTime: c.endTime,
      segmentIndexStart: c.segmentIndexStart,
      segmentIndexEnd: c.segmentIndexEnd,
    })),
  });

  await ctx.db
    .update(videos)
    .set({ chromaCollectionId: collectionId })
    .where(eq(videos.id, ctx.videoId));

  ctx.emit({ videoId: ctx.videoId, step: 'embed', status: 'completed', data: { chunkCount: chunks.length, collectionId } });
}
