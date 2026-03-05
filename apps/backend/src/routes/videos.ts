import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { videos } from '../db/schema.js';
import { generateId } from '../db/index.js';
import { IngestionPipeline, PIPELINE_STEPS, type PipelineStepName } from '../services/pipeline.js';

type Db = Awaited<ReturnType<typeof import('../db/index.js').getDb>>;

type Env = {
  Variables: {
    db: Db;
    pipeline: IngestionPipeline;
  };
};

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const YOUTUBE_URL_RE =
  /^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/;

function extractYoutubeId(url: string): string | null {
  const match = url.match(YOUTUBE_URL_RE);
  return match ? match[1] : null;
}

const createVideoSchema = z.object({
  url: z
    .string()
    .url('Must be a valid URL')
    .refine((url) => extractYoutubeId(url) !== null, {
      message: 'URL must be a valid YouTube video URL',
    }),
});

const reprocessSchema = z.object({
  fromStep: z.enum(PIPELINE_STEPS as [PipelineStepName, ...PipelineStepName[]]).optional(),
});

// ─── Router ───────────────────────────────────────────────────────────────────

const videosRouter = new Hono<Env>();

/**
 * POST /api/videos
 * Accept a YouTube URL, check for duplicates, create a video record,
 * and trigger the ingestion pipeline asynchronously.
 */
videosRouter.post('/', zValidator('json', createVideoSchema), async (c) => {
  const db = c.get('db');
  const pipeline = c.get('pipeline');
  const { url } = c.req.valid('json');

  const youtubeId = extractYoutubeId(url)!;

  // Duplicate check
  const [existing] = await db
    .select({ id: videos.id, status: videos.status })
    .from(videos)
    .where(eq(videos.youtubeId, youtubeId));

  if (existing) {
    return c.json(
      {
        success: false,
        error: {
          message: 'Video already exists',
          videoId: existing.id,
          status: existing.status,
        },
      },
      409
    );
  }

  // Create video record with temporary placeholder values;
  // the downloading step will fill in real metadata.
  const videoId = generateId();
  await db.insert(videos).values({
    id: videoId,
    youtubeId,
    url,
    title: `[Pending] ${youtubeId}`,
    channelName: '',
    channelId: '',
    duration: 0,
    status: 'pending',
  });

  // Trigger pipeline asynchronously — do not await
  pipeline.run(videoId).catch((err: Error) => {
    console.error(`[pipeline] Unhandled error for video ${videoId}:`, err.message);
  });

  return c.json({ success: true, videoId }, 202);
});

/**
 * GET /api/videos/:id/status
 * Return the current pipeline step and progress for a video.
 */
videosRouter.get('/:id/status', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const [video] = await db
    .select({
      id: videos.id,
      status: videos.status,
      errorMessage: videos.errorMessage,
      title: videos.title,
      youtubeId: videos.youtubeId,
    })
    .from(videos)
    .where(eq(videos.id, id));

  if (!video) {
    return c.json({ success: false, error: { message: 'Video not found' } }, 404);
  }

  const totalSteps = PIPELINE_STEPS.length;
  const stepIndex = PIPELINE_STEPS.indexOf(video.status as PipelineStepName);
  // stepIndex is -1 for 'pending', 'ready', 'error' — that is intentional
  const progress =
    stepIndex >= 0
      ? { currentStep: video.status, stepIndex, totalSteps }
      : { currentStep: video.status, stepIndex: null, totalSteps };

  return c.json({ success: true, video: { ...video, progress } });
});

/**
 * POST /api/videos/:id/reprocess
 * Re-run the pipeline from an optional starting step.
 */
videosRouter.post('/:id/reprocess', zValidator('json', reprocessSchema), async (c) => {
  const db = c.get('db');
  const pipeline = c.get('pipeline');
  const id = c.req.param('id');
  const { fromStep } = c.req.valid('json');

  const [video] = await db
    .select({ id: videos.id })
    .from(videos)
    .where(eq(videos.id, id));

  if (!video) {
    return c.json({ success: false, error: { message: 'Video not found' } }, 404);
  }

  // Trigger pipeline from the given step (or from the beginning)
  pipeline.run(id, fromStep).catch((err: Error) => {
    console.error(`[pipeline] Unhandled reprocess error for video ${id}:`, err.message);
  });

  return c.json({ success: true, videoId: id, fromStep: fromStep ?? PIPELINE_STEPS[0] });
});

export { videosRouter };
