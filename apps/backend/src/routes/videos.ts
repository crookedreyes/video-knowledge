import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { ConfigService } from '../services/config.js';
import { getDb, generateId } from '../db/index.js';
import { videos } from '../db/schema.js';

type Env = { Variables: { configService: ConfigService } };

const videosRouter = new Hono<Env>();

// YouTube URL patterns
const YOUTUBE_REGEX =
  /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

function extractYoutubeId(url: string): string | null {
  const match = url.match(YOUTUBE_REGEX);
  return match ? match[1] : null;
}

const addVideoSchema = z.object({
  url: z.string().url(),
});

const retrySchema = z.object({});

/**
 * POST /api/videos — add a new video for ingestion
 */
videosRouter.post('/', zValidator('json', addVideoSchema), async (c) => {
  const { url } = c.req.valid('json');

  const youtubeId = extractYoutubeId(url);
  if (!youtubeId) {
    return c.json(
      { success: false, error: 'Invalid YouTube URL' },
      400
    );
  }

  const db = await getDb();

  // Check for duplicate
  const existing = await db
    .select()
    .from(videos)
    .where(eq(videos.youtubeId, youtubeId))
    .limit(1);

  if (existing.length > 0) {
    return c.json(
      {
        success: false,
        error: 'duplicate',
        existingVideoId: existing[0].id,
        existingVideoTitle: existing[0].title,
      },
      409
    );
  }

  const id = generateId();
  const normalizedUrl = `https://www.youtube.com/watch?v=${youtubeId}`;

  await db.insert(videos).values({
    id,
    youtubeId,
    url: normalizedUrl,
    title: `YouTube Video (${youtubeId})`, // placeholder; pipeline will update
    channelName: 'Unknown',
    channelId: 'unknown',
    duration: 0,
    status: 'pending',
  });

  const [video] = await db
    .select()
    .from(videos)
    .where(eq(videos.id, id))
    .limit(1);

  return c.json({ success: true, data: video }, 201);
});

/**
 * GET /api/videos/:id/status — poll ingestion status
 */
videosRouter.get('/:id/status', async (c) => {
  const { id } = c.req.param();
  const db = await getDb();

  const [video] = await db
    .select()
    .from(videos)
    .where(eq(videos.id, id))
    .limit(1);

  if (!video) {
    return c.json({ success: false, error: 'Video not found' }, 404);
  }

  // Map DB status to pipeline steps
  const STEPS = ['downloading', 'transcribing', 'embedding', 'summarizing', 'tagging'] as const;
  type PipelineStep = typeof STEPS[number];

  const stepIndex = STEPS.indexOf(video.status as PipelineStep);
  const currentStep = stepIndex >= 0 ? video.status : null;

  return c.json({
    success: true,
    data: {
      id: video.id,
      status: video.status,
      currentStep,
      steps: STEPS.map((step) => ({
        name: step,
        completed: stepIndex > STEPS.indexOf(step) || video.status === 'ready',
        active: video.status === step,
      })),
      errorMessage: video.errorMessage ?? null,
      title: video.title,
      youtubeId: video.youtubeId,
    },
  });
});

/**
 * POST /api/videos/:id/retry — retry a failed ingestion
 */
videosRouter.post('/:id/retry', zValidator('json', retrySchema), async (c) => {
  const { id } = c.req.param();
  const db = await getDb();

  const [video] = await db
    .select()
    .from(videos)
    .where(eq(videos.id, id))
    .limit(1);

  if (!video) {
    return c.json({ success: false, error: 'Video not found' }, 404);
  }

  if (video.status !== 'error') {
    return c.json({ success: false, error: 'Video is not in error state' }, 400);
  }

  await db
    .update(videos)
    .set({ status: 'pending', errorMessage: null, updatedAt: new Date().toISOString() })
    .where(eq(videos.id, id));

  return c.json({ success: true });
});

export { videosRouter };
