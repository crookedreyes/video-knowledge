import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, desc, asc, sql } from 'drizzle-orm';
import { chatSessions, chatMessages } from '../db/schema.js';
import { generateId } from '../db/index.js';
import type { RAGService } from '../services/rag.js';
import type { getDb } from '../db/index.js';

type Db = Awaited<ReturnType<typeof getDb>>;
type Env = {
  Variables: {
    db: Db;
    ragService: RAGService;
  };
};

const chatRouter = new Hono<Env>();

// --- POST /api/chat/sessions — create a new chat session ---

const createSessionSchema = z.object({
  title: z.string().min(1),
  scope: z.enum(['global', 'video']).default('global'),
  videoId: z.string().optional(),
});

chatRouter.post('/sessions', zValidator('json', createSessionSchema), async (c) => {
  const db = c.get('db');
  const { title, scope, videoId } = c.req.valid('json');

  const id = generateId();
  const now = new Date().toISOString();

  await db.insert(chatSessions).values({
    id,
    title,
    scope,
    videoId: videoId ?? null,
    createdAt: now,
    updatedAt: now,
  });

  const [session] = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.id, id))
    .limit(1);

  return c.json({ success: true, data: session }, 201);
});

// --- GET /api/chat/sessions — list sessions ordered by updated_at desc ---

chatRouter.get('/sessions', async (c) => {
  const db = c.get('db');

  const sessions = await db
    .select()
    .from(chatSessions)
    .orderBy(desc(chatSessions.updatedAt));

  return c.json({ success: true, data: sessions });
});

// --- GET /api/chat/sessions/:id — get session with messages ---

chatRouter.get('/sessions/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const [session] = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.id, id))
    .limit(1);

  if (!session) {
    return c.json({ success: false, error: 'Session not found' }, 404);
  }

  const messages = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, id))
    .orderBy(asc(chatMessages.createdAt));

  const messagesWithCitations = messages.map((m) => ({
    ...m,
    citations: m.citations ? JSON.parse(m.citations) : null,
  }));

  return c.json({ success: true, data: { ...session, messages: messagesWithCitations } });
});

// --- DELETE /api/chat/sessions/:id — delete session (cascade deletes messages) ---

chatRouter.delete('/sessions/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const [session] = await db
    .select({ id: chatSessions.id })
    .from(chatSessions)
    .where(eq(chatSessions.id, id))
    .limit(1);

  if (!session) {
    return c.json({ success: false, error: 'Session not found' }, 404);
  }

  await db.delete(chatSessions).where(eq(chatSessions.id, id));

  return c.json({ success: true });
});

// --- POST /api/chat/sessions/:id/messages — send a message and stream SSE response ---

const sendMessageSchema = z.object({
  content: z.string().min(1),
});

chatRouter.post(
  '/sessions/:id/messages',
  zValidator('json', sendMessageSchema),
  async (c) => {
    const db = c.get('db');
    const ragService = c.get('ragService');
    const sessionId = c.req.param('id');
    const { content } = c.req.valid('json');

    // Load session
    const [session] = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, sessionId))
      .limit(1);

    if (!session) {
      return c.json({ success: false, error: 'Session not found' }, 404);
    }

    // Load chat history BEFORE saving the new user message
    const history = await ragService.loadHistory(sessionId);

    // Save the user message
    await db.insert(chatMessages).values({
      id: generateId(),
      sessionId,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    });

    return streamSSE(c, async (stream) => {
      // Step 1: Retrieve relevant chunks
      let chunks: Awaited<ReturnType<typeof ragService.retrieve>> = [];
      try {
        chunks = await ragService.retrieve(
          content,
          session.scope as 'global' | 'video',
          session.videoId ?? undefined,
        );
      } catch {
        // ChromaDB unavailable — continue with empty chunks
      }

      await stream.writeSSE({
        event: 'retrieval',
        data: JSON.stringify({ chunks }),
      });

      // Step 2: Build prompt with history and chunks, then stream LLM response
      const messages = ragService.buildMessages(chunks, history, content);

      let fullText = '';
      try {
        for await (const chunk of ragService.stream(messages)) {
          fullText += chunk;
          await stream.writeSSE({
            event: 'chunk',
            data: JSON.stringify({ text: chunk }),
          });
        }
      } catch {
        // LLM unavailable — emit an informative message
        const errorMsg = 'The language model is currently unavailable. Please try again later.';
        fullText = errorMsg;
        await stream.writeSSE({
          event: 'chunk',
          data: JSON.stringify({ text: errorMsg }),
        });
      }

      // Step 3: Parse citations and emit citation events
      const citations = ragService.parseCitations(fullText, chunks);
      for (const citation of citations) {
        await stream.writeSSE({
          event: 'citation',
          data: JSON.stringify(citation),
        });
      }

      // Step 4: Save the assistant message with citations
      const assistantMsgId = generateId();
      await db.insert(chatMessages).values({
        id: assistantMsgId,
        sessionId,
        role: 'assistant',
        content: fullText,
        citations: citations.length > 0 ? JSON.stringify(citations) : null,
        createdAt: new Date().toISOString(),
      });

      // Step 5: Update session updated_at
      await db
        .update(chatSessions)
        .set({ updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(chatSessions.id, sessionId));

      // Step 6: Emit done event
      await stream.writeSSE({
        event: 'done',
        data: JSON.stringify({ messageId: assistantMsgId }),
      });
    });
  },
);

export { chatRouter };
