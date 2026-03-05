import { Hono } from 'hono';
import { eq, desc } from 'drizzle-orm';
import { videos, transcriptSegments, chapters, tags, videoTags } from '../db/schema.js';
import { sql } from 'drizzle-orm';
import type { ConfigService } from '../services/config.js';
import type { PipelineOrchestrator } from '../services/pipeline/orchestrator.js';
import type { VectorStoreService } from '../services/vectorStore.js';
import type { getDb } from '../db/index.js';

type Db = Awaited<ReturnType<typeof getDb>>;
type Env = {
  Variables: {
    db: Db;
    configService: ConfigService;
    pipeline: PipelineOrchestrator;
    vectorStoreService: VectorStoreService;
  };
};

const videosRouter = new Hono<Env>();

// GET /api/videos — list all videos
videosRouter.get('/', async (c) => {
  const db = c.get('db');
  const rows = await db
    .select()
    .from(videos)
    .orderBy(desc(videos.createdAt));
  return c.json({ success: true, data: rows });
});

// GET /api/videos/:id — get video detail with transcript, summary, tags
videosRouter.get('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const rows = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  if (rows.length === 0) {
    return c.json({ success: false, error: 'Video not found' }, 404);
  }
  const video = rows[0];

  const segments = await db
    .select()
    .from(transcriptSegments)
    .where(eq(transcriptSegments.videoId, id))
    .orderBy(transcriptSegments.segmentIndex);

  const tagRows = await db
    .select({ id: tags.id, name: tags.name, color: tags.color, source: videoTags.source })
    .from(videoTags)
    .innerJoin(tags, eq(videoTags.tagId, tags.id))
    .where(eq(videoTags.videoId, id));

  return c.json({
    success: true,
    data: { ...video, segments, tags: tagRows },
  });
});

// POST /api/videos/:id/retry — retry pipeline from failed step
videosRouter.post('/:id/retry', async (c) => {
  const pipeline = c.get('pipeline');
  const id = c.req.param('id');

  try {
    await pipeline.retry(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: message }, 400);
  }

  return c.json({ success: true, videoId: id });
});

// DELETE /api/videos/:id — delete video and all associated data
videosRouter.delete('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const rows = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  if (rows.length === 0) {
    return c.json({ success: false, error: 'Video not found' }, 404);
  }

  // Try to clean up vector store embeddings
  try {
    const vectorStore = c.get('vectorStoreService');
    await vectorStore.deleteVideoEmbeddings(id);
  } catch (_) {
    // Best-effort cleanup
  }

  // Delete from DB (cascades to transcript_segments, chapters, video_tags, chat_sessions)
  await db.delete(videos).where(eq(videos.id, id));

  return c.json({ success: true });
});

// PUT /api/videos/:id/summary — update summary
videosRouter.put('/:id/summary', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const body = await c.req.json<{ summary: string }>();

  const rows = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  if (rows.length === 0) {
    return c.json({ success: false, error: 'Video not found' }, 404);
  }

  await db
    .update(videos)
    .set({ summary: body.summary, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(videos.id, id));

  return c.json({ success: true });
});

// POST /api/videos/:id/tags — add tag to video
videosRouter.post('/:id/tags', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const body = await c.req.json<{ tagId: string }>();

  await db.insert(videoTags).values({
    videoId: id,
    tagId: body.tagId,
    source: 'manual',
  }).onConflictDoNothing();

  return c.json({ success: true });
});

// DELETE /api/videos/:id/tags/:tagId — remove tag from video
videosRouter.delete('/:id/tags/:tagId', async (c) => {
  const db = c.get('db');
  const videoId = c.req.param('id');
  const tagId = c.req.param('tagId');

  await db.delete(videoTags).where(
    sql`${videoTags.videoId} = ${videoId} AND ${videoTags.tagId} = ${tagId}`
  );

  return c.json({ success: true });
});

// GET /api/videos/:id/transcript — get transcript segments
videosRouter.get('/:id/transcript', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const segments = await db
    .select()
    .from(transcriptSegments)
    .where(eq(transcriptSegments.videoId, id))
    .orderBy(transcriptSegments.segmentIndex);

  return c.json({ success: true, data: segments });
});

// GET /api/videos/:id/chapters — get chapters
videosRouter.get('/:id/chapters', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const rows = await db
    .select()
    .from(chapters)
    .where(eq(chapters.videoId, id))
    .orderBy(chapters.chapterIndex);

  return c.json({ success: true, data: rows });
});

export { videosRouter };
