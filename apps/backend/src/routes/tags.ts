import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { tags, videoTags } from '../db/schema.js';
import { generateId } from '../db/index.js';
import type { getDb } from '../db/index.js';

type Db = Awaited<ReturnType<typeof getDb>>;
type Env = { Variables: { db: Db } };

const tagsRouter = new Hono<Env>();

const createTagSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

// GET /api/tags — list all tags with video counts
tagsRouter.get('/', async (c) => {
  const db = c.get('db');

  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
      color: tags.color,
      createdAt: tags.createdAt,
      videoCount: sql<number>`count(${videoTags.videoId})`.as('video_count'),
    })
    .from(tags)
    .leftJoin(videoTags, eq(tags.id, videoTags.tagId))
    .groupBy(tags.id)
    .orderBy(tags.name);

  return c.json({ success: true, data: rows });
});

// POST /api/tags — create a manual tag
tagsRouter.post('/', zValidator('json', createTagSchema), async (c) => {
  const db = c.get('db');
  const { name, color } = c.req.valid('json');

  // Check for duplicate
  const existing = await db.select({ id: tags.id }).from(tags).where(eq(tags.name, name)).limit(1);
  if (existing.length > 0) {
    return c.json({ success: false, error: 'Tag already exists' }, 409);
  }

  const id = generateId();
  await db.insert(tags).values({ id, name, color: color ?? '#000000' });

  const [created] = await db.select().from(tags).where(eq(tags.id, id)).limit(1);
  return c.json({ success: true, data: created }, 201);
});

// DELETE /api/tags/:id — delete a tag
tagsRouter.delete('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const rows = await db.select({ id: tags.id }).from(tags).where(eq(tags.id, id)).limit(1);
  if (rows.length === 0) {
    return c.json({ success: false, error: 'Tag not found' }, 404);
  }

  // CASCADE on video_tags handles junction cleanup
  await db.delete(tags).where(eq(tags.id, id));

  return c.json({ success: true });
});

export { tagsRouter };
