import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { tags } from '../db/schema.js';
import { ulid } from 'ulid';
import type { getDb } from '../db/index.js';

type Db = Awaited<ReturnType<typeof getDb>>;
type Env = {
  Variables: {
    db: Db;
  };
};

const tagsRouter = new Hono<Env>();

// GET /api/tags — list all tags
tagsRouter.get('/', async (c) => {
  const db = c.get('db');
  const rows = await db.select().from(tags);
  return c.json({ success: true, data: rows });
});

// POST /api/tags — create a new tag
tagsRouter.post('/', async (c) => {
  const db = c.get('db');
  const body = await c.req.json<{ name: string; color?: string }>();

  const id = ulid();
  await db.insert(tags).values({
    id,
    name: body.name,
    color: body.color || '#6366f1',
  });

  const [tag] = await db.select().from(tags).where(eq(tags.id, id));
  return c.json({ success: true, data: tag }, 201);
});

// DELETE /api/tags/:id — delete a tag
tagsRouter.delete('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  await db.delete(tags).where(eq(tags.id, id));
  return c.json({ success: true });
});

export { tagsRouter };
