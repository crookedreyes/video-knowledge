import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { settingsSchema } from '../services/config.js';
import type { ConfigService } from '../services/config.js';

type Env = { Variables: { configService: ConfigService } };

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

export { settings as settingsRouter };
