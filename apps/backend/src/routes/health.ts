import { Hono } from 'hono';
import type { OpenAIClientManager } from '../services/openai-client.js';

type Env = { Variables: { openAIClientManager: OpenAIClientManager } };

const health = new Hono<Env>();

health.get('/llm', async (c) => {
  const manager = c.get('openAIClientManager');
  const client = manager.getClient();

  try {
    // List models as a lightweight connectivity check
    await client.models.list();
    return c.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json(
      { status: 'error', error: message, timestamp: new Date().toISOString() },
      503
    );
  }
});

export { health as healthRouter };
