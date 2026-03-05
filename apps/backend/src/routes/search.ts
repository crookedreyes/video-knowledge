import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { inArray } from 'drizzle-orm';
import { videos } from '../db/schema.js';
import type { EmbeddingService } from '../services/embedding.js';
import type { VectorStoreService } from '../services/vectorStore.js';
import type { ConfigService } from '../services/config.js';
import type { getDb } from '../db/index.js';

type Db = Awaited<ReturnType<typeof getDb>>;
type Env = {
  Variables: {
    db: Db;
    configService: ConfigService;
    embeddingService: EmbeddingService;
    vectorStoreService: VectorStoreService;
  };
};

const searchBodySchema = z.object({
  query: z.string().min(1),
  videoIds: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const searchRouter = new Hono<Env>();

searchRouter.post('/', zValidator('json', searchBodySchema), async (c) => {
  const { query, videoIds, limit } = c.req.valid('json');
  const db = c.get('db');
  const configService = c.get('configService');
  const embeddingService = c.get('embeddingService');
  const vectorStoreService = c.get('vectorStoreService');

  const topK = limit ?? configService.get<number>('rag.topK') ?? 10;

  // 1. Embed the query
  let queryEmbedding: number[];
  try {
    queryEmbedding = await embeddingService.embedSingle(query);
  } catch {
    return c.json({ results: [] });
  }

  // 2. Query ChromaDB
  let chromaResults;
  try {
    chromaResults = await vectorStoreService.query(queryEmbedding, topK, videoIds);
  } catch {
    // ChromaDB unavailable — return empty
    return c.json({ results: [] });
  }

  if (chromaResults.length === 0) {
    return c.json({ results: [] });
  }

  // 3. Enrich with SQLite video metadata
  const videoIdSet = [...new Set(chromaResults.map((r) => r.videoId))].filter(Boolean);
  const videoRows = await db
    .select({
      id: videos.id,
      title: videos.title,
      youtubeId: videos.youtubeId,
      thumbnailPath: videos.thumbnailPath,
      channelName: videos.channelName,
    })
    .from(videos)
    .where(inArray(videos.id, videoIdSet));

  const videoMap = new Map(videoRows.map((v) => [v.id, v]));

  // 4. Sort by distance ascending (most relevant first) and map to response shape
  const sorted = chromaResults.slice().sort((a, b) => a.distance - b.distance);

  const results = sorted
    .map((result) => {
      const video = videoMap.get(result.videoId);
      if (!video) return null;
      return {
        videoId: result.videoId,
        videoTitle: video.title,
        thumbnailUrl: video.thumbnailPath
          ? `/api/files/thumbnails/${video.youtubeId}.webp`
          : null,
        channelName: video.channelName,
        text: result.text,
        startTime: result.startTime,
        endTime: result.endTime,
        score: Math.max(0, 1 - result.distance),
      };
    })
    .filter(Boolean);

  return c.json({ results });
});

export { searchRouter };
