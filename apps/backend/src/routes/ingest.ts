import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { PipelineOrchestrator, PipelineEvent } from '../services/pipeline/orchestrator.js';
import type { ConfigService } from '../services/config.js';
import type { getDb } from '../db/index.js';

type Db = Awaited<ReturnType<typeof getDb>>;
type Env = {
  Variables: {
    db: Db;
    configService: ConfigService;
    pipeline: PipelineOrchestrator;
  };
};

const ingest = new Hono<Env>();

// POST /api/ingest — start ingestion for a YouTube URL
ingest.post(
  '/',
  zValidator('json', z.object({ url: z.string().min(1) })),
  async (c) => {
    const { url } = c.req.valid('json');
    const pipeline = c.get('pipeline');

    let videoId: string;
    try {
      videoId = await pipeline.start(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ success: false, error: message }, 400);
    }

    return c.json({ success: true, videoId }, 202);
  }
);

// GET /api/ingest/events — SSE stream for real-time pipeline events
// Clients can filter by ?videoId=<id>
ingest.get('/events', (c) => {
  const filterVideoId = c.req.query('videoId') ?? null;
  const pipeline = c.get('pipeline');

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (event: PipelineEvent) => {
        if (filterVideoId && event.videoId !== filterVideoId) return;
        const data = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(data));
      };

      // Keep-alive ping every 15 seconds
      const ping = setInterval(() => {
        controller.enqueue(encoder.encode(': ping\n\n'));
      }, 15000);

      pipeline.on('event', send);

      // Cleanup when client disconnects (signal is available in Bun)
      c.req.raw.signal?.addEventListener('abort', () => {
        clearInterval(ping);
        pipeline.off('event', send);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
});

export { ingest as ingestRouter };
