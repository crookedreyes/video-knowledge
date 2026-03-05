import { Hono } from 'hono';
import type { ConfigService } from '../services/config.js';
import { DockerManager } from '../services/docker.js';

type Env = { Variables: { configService: ConfigService; dockerManager: DockerManager } };

const docker = new Hono<Env>();

docker.post('/start', async (c) => {
  const dm = c.get('dockerManager');
  try {
    await dm.ensureRunning();
    const status = await dm.getStatus();
    return c.json({ success: true, status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: message }, 500);
  }
});

docker.post('/stop', async (c) => {
  const dm = c.get('dockerManager');
  try {
    await dm.stop();
    const status = await dm.getStatus();
    return c.json({ success: true, status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: message }, 500);
  }
});

export { docker as dockerSettingsRouter };
