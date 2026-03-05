import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { settingsSchema } from '../services/config.js';
import type { ConfigService } from '../services/config.js';
import type { OpenAIClientManager } from '../services/openai-client.js';

type Env = { Variables: { configService: ConfigService; openAIClientManager: OpenAIClientManager } };

const settings = new Hono<Env>();

settings.get('/', (c) => {
  const configService = c.get('configService');
  return c.json(configService.getAll());
});

settings.patch('/', zValidator('json', settingsSchema), async (c) => {
  const configService = c.get('configService');
  const updates = c.req.valid('json');
  await configService.setMany(updates as Record<string, unknown>);
  return c.json(configService.getAll());
});

settings.get('/models', async (c) => {
  const manager = c.get('openAIClientManager');
  const client = manager.getClient();

  try {
    const response = await client.models.list();
    const modelIds = response.data.map((m) => m.id);
    return c.json({ models: modelIds });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ models: [], error: message }, 503);
  }
});

export { settings as settingsRouter };
