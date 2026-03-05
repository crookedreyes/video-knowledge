import EventEmitter from 'node:events';
import { eq } from 'drizzle-orm';
import { videos } from '../../db/schema.js';
import type { ConfigService } from '../config.js';
import type { Db, PipelineEvent, PipelineStepName } from './types.js';
import { validateStep } from './steps/validate.js';
import { downloadStep } from './steps/download.js';
import { transcribeStep } from './steps/transcribe.js';
import { embedStep } from './steps/embed.js';
import { summarizeStep } from './steps/summarize.js';
import { tagStep } from './steps/tag.js';

export type { PipelineEvent };

/**
 * Maps each pipeline status to the step that handles it (and any statuses
 * that can be skipped over when retrying).
 */
const STATUS_TO_STEP: Record<string, PipelineStepName | null> = {
  pending: 'validate',
  downloading: 'download',
  transcribing: 'transcribe',
  embedding: 'embed',
  summarizing: 'summarize',
  tagging: 'tag',
  ready: null,
  error: null, // determined at runtime
};

const PIPELINE_ORDER: PipelineStepName[] = [
  'validate',
  'download',
  'transcribe',
  'embed',
  'summarize',
  'tag',
];

export class PipelineOrchestrator extends EventEmitter {
  private db: Db;
  private config: ConfigService;
  // Track active runs to prevent double-starts
  private running: Set<string> = new Set();

  constructor(db: Db, config: ConfigService) {
    super();
    this.db = db;
    this.config = config;
  }

  /**
   * Start or retry the pipeline for a given YouTube URL or video DB id.
   * Returns the video DB id.
   */
  async start(urlOrId: string): Promise<string> {
    const emit = (event: PipelineEvent) => this.emit('event', event);

    // Step 1 is special: it resolves the YouTube ID → DB video id
    const videoId = await validateStep({
      videoId: urlOrId,
      db: this.db,
      config: this.config,
      emit,
    });

    if (this.running.has(videoId)) {
      throw new Error(`Pipeline already running for video ${videoId}`);
    }

    // Run remaining steps async; caller gets the videoId immediately
    this.running.add(videoId);
    this.runRemainingSteps(videoId, 'download', emit).finally(() => {
      this.running.delete(videoId);
    });

    return videoId;
  }

  /**
   * Retry the pipeline for an existing video DB id from the failed step.
   */
  async retry(videoId: string): Promise<void> {
    if (this.running.has(videoId)) {
      throw new Error(`Pipeline already running for video ${videoId}`);
    }

    const rows = await this.db
      .select({ status: videos.status })
      .from(videos)
      .where(eq(videos.id, videoId))
      .limit(1);

    if (rows.length === 0) throw new Error(`Video not found: ${videoId}`);
    const { status } = rows[0];

    // Determine restart step
    let startStep: PipelineStepName;
    if (status === 'error') {
      // Re-run from the last status that was in-progress before the error
      // We default to 'download' since validate already ran to create the record
      startStep = 'download';
    } else if (status === 'ready') {
      throw new Error(`Video ${videoId} is already in ready state`);
    } else {
      startStep = (STATUS_TO_STEP[status] as PipelineStepName) ?? 'download';
    }

    const emit = (event: PipelineEvent) => this.emit('event', event);

    this.running.add(videoId);
    // Reset error message
    await this.db.update(videos).set({ errorMessage: null }).where(eq(videos.id, videoId));

    this.runRemainingSteps(videoId, startStep, emit).finally(() => {
      this.running.delete(videoId);
    });
  }

  private async runRemainingSteps(
    videoId: string,
    fromStep: PipelineStepName,
    emit: (e: PipelineEvent) => void
  ): Promise<void> {
    const startIdx = PIPELINE_ORDER.indexOf(fromStep);
    const stepsToRun = PIPELINE_ORDER.slice(startIdx);
    const ctx = { videoId, db: this.db, config: this.config, emit };

    try {
      for (const step of stepsToRun) {
        switch (step) {
          case 'download': await downloadStep(ctx); break;
          case 'transcribe': await transcribeStep(ctx); break;
          case 'embed': await embedStep(ctx); break;
          case 'summarize': await summarizeStep(ctx); break;
          case 'tag': await tagStep(ctx); break;
        }
      }

      await this.db.update(videos).set({ status: 'ready' }).where(eq(videos.id, videoId));
      emit({ videoId, step: 'done', status: 'completed', message: 'Pipeline complete' });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.db
        .update(videos)
        .set({ status: 'error', errorMessage })
        .where(eq(videos.id, videoId));
      emit({ videoId, step: 'error', status: 'failed', message: errorMessage });
    }
  }

  isRunning(videoId: string): boolean {
    return this.running.has(videoId);
  }
}
