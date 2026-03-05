import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, desc, asc } from 'drizzle-orm';
import { chatSessions, chatMessages } from '../db/schema.js';
import { generateId } from '../db/index.js';
import { RAGService } from '../services/rag.js';
import type { LLMService } from '../services/llm.js';
import type { EmbeddingService } from '../services/embedding.js';
import type { ConfigService } from '../services/config.js';
import type { getDb } from '../db/index.js';

type Db = Awaited<ReturnType<typeof getDb>>;
type Env = {
  Variables: {
    db: Db;
    llmService: LLMService;
    embeddingService: EmbeddingService;
    configService: ConfigService;
  };
};

const chatRouter = new Hono<Env>();

const createSessionSchema = z.object({
  title: z.string().min(1),
  scope: z.enum(['global', 'video']).default('global'),
  videoId: z.string().optional(),
});

const sendMessageSchema = z.object({
  content: z.string().min(1),
});

// POST /api/chat/sessions — create a new chat session
chatRouter.post('/sessions', zValidator('json', createSessionSchema), async (c) => {
  const db = c.get('db');
  const { title, scope, videoId } = c.req.valid('json');

  const id = generateId();
  await db.insert(chatSessions).values({
    id,
    title,
    scope,
    videoId: scope === 'video' ? videoId ?? null : null,
  });

  const [session] = await db.select().from(chatSessions).where(eq(chatSessions.id, id)).limit(1);
  return c.json({ success: true, data: session }, 201);
});

// GET /api/chat/sessions — list sessions ordered by updated_at desc
chatRouter.get('/sessions', async (c) => {
  const db = c.get('db');
  const sessions = await db
    .select()
    .from(chatSessions)
    .orderBy(desc(chatSessions.updatedAt));
  return c.json({ success: true, data: sessions });
});

// GET /api/chat/sessions/:id — get session + messages
chatRouter.get('/sessions/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const sessions = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.id, id))
    .limit(1);

  if (sessions.length === 0) {
    return c.json({ success: false, error: 'Session not found' }, 404);
  }

  const messages = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, id))
    .orderBy(asc(chatMessages.createdAt));

  // Parse citations JSON
  const parsedMessages = messages.map((m) => ({
    ...m,
    citations: m.citations ? JSON.parse(m.citations) : null,
  }));

  return c.json({ success: true, data: { ...sessions[0], messages: parsedMessages } });
});

// DELETE /api/chat/sessions/:id — delete session (cascade deletes messages)
chatRouter.delete('/sessions/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const sessions = await db
    .select({ id: chatSessions.id })
    .from(chatSessions)
    .where(eq(chatSessions.id, id))
    .limit(1);

  if (sessions.length === 0) {
    return c.json({ success: false, error: 'Session not found' }, 404);
  }

  await db.delete(chatSessions).where(eq(chatSessions.id, id));
  return c.json({ success: true });
});

// POST /api/chat/sessions/:id/messages — send message, returns SSE stream
chatRouter.post('/sessions/:id/messages', zValidator('json', sendMessageSchema), async (c) => {
  const db = c.get('db');
  const sessionId = c.req.param('id');
  const { content } = c.req.valid('json');

  const sessions = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.id, sessionId))
    .limit(1);

  if (sessions.length === 0) {
    return c.json({ success: false, error: 'Session not found' }, 404);
  }

  // Store user message first
  const userMessageId = generateId();
  await db.insert(chatMessages).values({
    id: userMessageId,
    sessionId,
    role: 'user',
    content,
    citations: null,
  });

  const assistantMessageId = generateId();
  const ragService = new RAGService(
    db,
    c.get('llmService'),
    c.get('embeddingService'),
    c.get('configService')
  );

  return streamSSE(c, async (stream) => {
    await ragService.streamMessage(sessionId, content, assistantMessageId, async (event) => {
      await stream.writeSSE({
        event: event.event,
        data: JSON.stringify(event.data),
      });
    });
  });
});

export { chatRouter };
