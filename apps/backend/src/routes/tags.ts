import { Hono } from 'hono';
import { tags } from '../db/schema.js';
import { randomUUID } from 'node:crypto';
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
  const { name, color } = await c.req.json<{ name: string; color: string }>();
  const id = randomUUID();

  await db.insert(tags).values({ id, name, color });
  return c.json({ success: true, data: { id, name, color } });
});

export { tagsRouter };
