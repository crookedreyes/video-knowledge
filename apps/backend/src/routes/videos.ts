import { Hono } from 'hono';
import { eq, desc, and } from 'drizzle-orm';
import { videos, transcriptSegments, tags, videoTags } from '../db/schema.js';
import type { ConfigService } from '../services/config.js';
import type { PipelineOrchestrator } from '../services/pipeline/orchestrator.js';
import type { getDb } from '../db/index.js';

type Db = Awaited<ReturnType<typeof getDb>>;
type Env = {
  Variables: {
    db: Db;
    configService: ConfigService;
    pipeline: PipelineOrchestrator;
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

// POST /api/videos/:id/tags — add existing tag to video
videosRouter.post('/:id/tags', async (c) => {
  const db = c.get('db');
  const videoId = c.req.param('id');
  const { tagId } = await c.req.json<{ tagId: string }>();

  await db.insert(videoTags).values({ videoId, tagId, source: 'manual' });

  const [tag] = await db.select().from(tags).where(eq(tags.id, tagId)).limit(1);
  return c.json({ success: true, data: { ...tag, source: 'manual' } });
});

// DELETE /api/videos/:id/tags/:tagId — remove tag from video
videosRouter.delete('/:id/tags/:tagId', async (c) => {
  const db = c.get('db');
  const videoId = c.req.param('id');
  const tagId = c.req.param('tagId');

  await db
    .delete(videoTags)
    .where(and(eq(videoTags.videoId, videoId), eq(videoTags.tagId, tagId)));

  return c.json({ success: true });
});

export { videosRouter };
