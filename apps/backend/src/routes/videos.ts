import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, desc, asc, and, like, sql, or, inArray } from 'drizzle-orm';
import { videos, transcriptSegments, chapters, tags, videoTags, chatSessions, chatMessages } from '../db/schema.js';
import type { ConfigService } from '../services/config.js';
import type { VectorStoreService } from '../services/vectorStore.js';
import type { PipelineOrchestrator } from '../services/pipeline/orchestrator.js';
import type { getDb } from '../db/index.js';
import { homedir } from 'os';
import { join } from 'path';
import { rm } from 'fs/promises';

type Db = Awaited<ReturnType<typeof getDb>>;
type Env = {
  Variables: {
    db: Db;
    configService: ConfigService;
    vectorStoreService: VectorStoreService;
    pipeline: PipelineOrchestrator;
  };
};

const videosRouter = new Hono<Env>();

// --- Query param schemas ---

const videoListQuerySchema = z.object({
  tag: z.string().optional(),
  status: z.enum(['pending', 'downloading', 'transcribing', 'embedding', 'summarizing', 'tagging', 'ready', 'error']).optional(),
  sort: z.enum(['date', 'title', 'duration']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  search: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const videoUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  summary: z.string().optional(),
});

const addTagSchema = z.object({
  tagId: z.string().min(1),
});

// --- GET /api/videos — list all videos with filtering, sorting, cursor pagination ---

videosRouter.get('/', zValidator('query', videoListQuerySchema), async (c) => {
  const db = c.get('db');
  const { tag, status, sort, order, search, cursor, limit: rawLimit } = c.req.valid('query');
  const limit = rawLimit ?? 20;

  // Build WHERE conditions
  const conditions: ReturnType<typeof eq>[] = [];

  if (status) {
    conditions.push(eq(videos.status, status));
  }

  if (search) {
    conditions.push(
      or(
        like(videos.title, `%${search}%`),
        like(videos.channelName, `%${search}%`),
      )!,
    );
  }

  // If filtering by tag, get matching video IDs first
  if (tag) {
    const taggedVideoIds = await db
      .select({ videoId: videoTags.videoId })
      .from(videoTags)
      .innerJoin(tags, eq(videoTags.tagId, tags.id))
      .where(eq(tags.name, tag));

    const ids = taggedVideoIds.map((r) => r.videoId);
    if (ids.length === 0) {
      return c.json({ success: true, data: [], nextCursor: null });
    }
    conditions.push(inArray(videos.id, ids));
  }

  // Cursor-based pagination: cursor is "createdAt|id"
  if (cursor) {
    const [cursorDate, cursorId] = cursor.split('|');
    if (cursorDate && cursorId) {
      conditions.push(
        or(
          sql`${videos.createdAt} < ${cursorDate}`,
          and(eq(videos.createdAt, cursorDate), sql`${videos.id} < ${cursorId}`),
        )!,
      );
    }
  }

  // Determine sort order
  let orderByClause;
  const sortDir = order === 'asc' ? asc : desc;
  switch (sort) {
    case 'title':
      orderByClause = [sortDir(videos.title), desc(videos.createdAt)];
      break;
    case 'duration':
      orderByClause = [sortDir(videos.duration), desc(videos.createdAt)];
      break;
    case 'date':
    default:
      orderByClause = [desc(videos.createdAt), desc(videos.id)];
      break;
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(videos)
    .where(where)
    .orderBy(...orderByClause)
    .limit(limit + 1); // fetch one extra for cursor

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && data.length > 0
    ? `${data[data.length - 1].createdAt}|${data[data.length - 1].id}`
    : null;

  return c.json({ success: true, data, nextCursor });
});

// --- GET /api/videos/:id — get video detail with transcript, chapters, tags ---

videosRouter.get('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const rows = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  if (rows.length === 0) {
    return c.json({ success: false, error: 'Video not found' }, 404);
  }
  const video = rows[0];

  const [segments, chapterRows, tagRows] = await Promise.all([
    db
      .select()
      .from(transcriptSegments)
      .where(eq(transcriptSegments.videoId, id))
      .orderBy(transcriptSegments.segmentIndex),
    db
      .select()
      .from(chapters)
      .where(eq(chapters.videoId, id))
      .orderBy(chapters.chapterIndex),
    db
      .select({ id: tags.id, name: tags.name, color: tags.color, source: videoTags.source })
      .from(videoTags)
      .innerJoin(tags, eq(videoTags.tagId, tags.id))
      .where(eq(videoTags.videoId, id)),
  ]);

  return c.json({
    success: true,
    data: { ...video, segments, chapters: chapterRows, tags: tagRows },
  });
});

// --- PATCH /api/videos/:id — update video title/summary ---

videosRouter.patch('/:id', zValidator('json', videoUpdateSchema), async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const updates = c.req.valid('json');

  const rows = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  if (rows.length === 0) {
    return c.json({ success: false, error: 'Video not found' }, 404);
  }

  await db
    .update(videos)
    .set({ ...updates, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(videos.id, id));

  const [updated] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  return c.json({ success: true, data: updated });
});

// --- DELETE /api/videos/:id — cascade delete everything ---

videosRouter.delete('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const rows = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  if (rows.length === 0) {
    return c.json({ success: false, error: 'Video not found' }, 404);
  }
  const video = rows[0];

  // 1. Delete ChromaDB embeddings (best effort)
  try {
    const vectorStore = c.get('vectorStoreService');
    await vectorStore.deleteVideoEmbeddings(id);
  } catch {
    // ChromaDB may be down — continue with other cleanup
  }

  // 2. Delete local files (video, audio, thumbnail)
  const mediaDir = join(homedir(), '.local', 'share', 'video-knowledge', 'media', video.youtubeId);
  try {
    await rm(mediaDir, { recursive: true, force: true });
  } catch {
    // Files may not exist
  }

  // 3. Delete SQLite records — CASCADE handles transcript_segments, chapters, video_tags
  //    chat_sessions has ON DELETE SET NULL, so handle chat cleanup explicitly
  const sessions = await db
    .select({ id: chatSessions.id })
    .from(chatSessions)
    .where(eq(chatSessions.videoId, id));

  if (sessions.length > 0) {
    const sessionIds = sessions.map((s) => s.id);
    await db.delete(chatMessages).where(inArray(chatMessages.sessionId, sessionIds));
    await db.delete(chatSessions).where(inArray(chatSessions.id, sessionIds));
  }

  // 4. Delete the video record (cascades to segments, chapters, video_tags)
  await db.delete(videos).where(eq(videos.id, id));

  return c.json({ success: true });
});

// --- GET /api/videos/:id/transcript — full transcript with timestamps ---

videosRouter.get('/:id/transcript', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const videoRows = await db.select({ id: videos.id }).from(videos).where(eq(videos.id, id)).limit(1);
  if (videoRows.length === 0) {
    return c.json({ success: false, error: 'Video not found' }, 404);
  }

  const segments = await db
    .select()
    .from(transcriptSegments)
    .where(eq(transcriptSegments.videoId, id))
    .orderBy(transcriptSegments.segmentIndex);

  return c.json({ success: true, data: segments });
});

// --- GET /api/videos/:id/chapters — YouTube chapters ---

videosRouter.get('/:id/chapters', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const videoRows = await db.select({ id: videos.id }).from(videos).where(eq(videos.id, id)).limit(1);
  if (videoRows.length === 0) {
    return c.json({ success: false, error: 'Video not found' }, 404);
  }

  const chapterRows = await db
    .select()
    .from(chapters)
    .where(eq(chapters.videoId, id))
    .orderBy(chapters.chapterIndex);

  return c.json({ success: true, data: chapterRows });
});

// --- POST /api/videos/:id/tags — add tag to video ---

videosRouter.post('/:id/tags', zValidator('json', addTagSchema), async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const { tagId } = c.req.valid('json');

  const videoRows = await db.select({ id: videos.id }).from(videos).where(eq(videos.id, id)).limit(1);
  if (videoRows.length === 0) {
    return c.json({ success: false, error: 'Video not found' }, 404);
  }

  const tagRows = await db.select({ id: tags.id }).from(tags).where(eq(tags.id, tagId)).limit(1);
  if (tagRows.length === 0) {
    return c.json({ success: false, error: 'Tag not found' }, 404);
  }

  await db
    .insert(videoTags)
    .values({ videoId: id, tagId, source: 'manual' })
    .onConflictDoNothing();

  return c.json({ success: true });
});

// --- DELETE /api/videos/:id/tags/:tagId — remove tag from video ---

videosRouter.delete('/:id/tags/:tagId', async (c) => {
  const db = c.get('db');
  const videoId = c.req.param('id');
  const tagId = c.req.param('tagId');

  await db
    .delete(videoTags)
    .where(and(eq(videoTags.videoId, videoId), eq(videoTags.tagId, tagId)));

  return c.json({ success: true });
});

// --- POST /api/videos/:id/retry — retry pipeline from failed step ---

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

export { videosRouter };
