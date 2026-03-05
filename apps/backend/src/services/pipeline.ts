import EventEmitter from 'node:events';
import { eq, sql } from 'drizzle-orm';
import { videos } from '../db/schema.js';

type Db = Awaited<ReturnType<typeof import('../db/index.js').getDb>>;

// ─── Pipeline step names (matches videos.status enum) ───────────────────────

export type PipelineStepName =
  | 'downloading'
  | 'transcribing'
  | 'embedding'
  | 'summarizing'
  | 'tagging';

export const PIPELINE_STEPS: PipelineStepName[] = [
  'downloading',
  'transcribing',
  'embedding',
  'summarizing',
  'tagging',
];

// ─── Service interfaces ───────────────────────────────────────────────────────

export interface VideoMetadata {
  youtubeId: string;
  title: string;
  description: string | null;
  channelName: string;
  channelId: string;
  duration: number;
  publishedAt: string | null;
  thumbnailPath: string | null;
}

export interface TranscriptSegment {
  startTime: number;
  endTime: number;
  text: string;
  language: string;
  segmentIndex: number;
}

export interface IDownloadService {
  fetchMetadata(url: string): Promise<VideoMetadata>;
  downloadVideo(videoId: string, url: string): Promise<string>;
  extractAudio(videoId: string, videoPath: string): Promise<string>;
}

export interface ITranscriptionService {
  transcribe(videoId: string, audioPath: string): Promise<TranscriptSegment[]>;
}

export interface IVectorStoreService {
  storeVideoEmbeddings(videoId: string, segments: TranscriptSegment[]): Promise<string>;
}

export interface ISummarizationService {
  summarize(videoId: string): Promise<string>;
}

export interface ITaggerService {
  autoTag(videoId: string): Promise<string[]>;
}

// ─── Progress event payload ───────────────────────────────────────────────────

export interface PipelineProgressEvent {
  videoId: string;
  step: PipelineStepName;
  stepIndex: number;
  totalSteps: number;
}

export interface PipelineErrorEvent {
  videoId: string;
  step: PipelineStepName;
  error: Error;
}

// ─── IngestionPipeline ────────────────────────────────────────────────────────

export interface PipelineServices {
  download: IDownloadService;
  transcription: ITranscriptionService;
  vectorStore: IVectorStoreService;
  summarization: ISummarizationService;
  tagger: ITaggerService;
}

export class IngestionPipeline extends EventEmitter {
  private db: Db;
  private services: PipelineServices;

  constructor(db: Db, services: PipelineServices) {
    super();
    this.db = db;
    this.services = services;
  }

  /**
   * Run the ingestion pipeline for a video.
   * @param videoId  DB primary key of the video record
   * @param fromStep Optional starting step; defaults to first step
   */
  async run(videoId: string, fromStep?: PipelineStepName): Promise<void> {
    const startIndex = fromStep ? PIPELINE_STEPS.indexOf(fromStep) : 0;
    if (startIndex === -1) {
      throw new Error(`Unknown pipeline step: ${fromStep}`);
    }

    const stepsToRun = PIPELINE_STEPS.slice(startIndex);
    const totalSteps = PIPELINE_STEPS.length;

    for (const step of stepsToRun) {
      const stepIndex = PIPELINE_STEPS.indexOf(step);

      // Update status in DB
      await this.setStatus(videoId, step);

      // Emit progress event
      const progressEvent: PipelineProgressEvent = {
        videoId,
        step,
        stepIndex,
        totalSteps,
      };
      this.emit('progress', progressEvent);

      try {
        await this.executeStep(videoId, step);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        await this.handleError(videoId, step, error);
        return;
      }
    }

    // All steps complete → mark ready
    await this.setStatus(videoId, 'ready' as any);
    this.emit('complete', { videoId });
  }

  private async executeStep(videoId: string, step: PipelineStepName): Promise<void> {
    // Fetch current video record for idempotency checks
    const [video] = await this.db
      .select()
      .from(videos)
      .where(eq(videos.id, videoId));

    if (!video) {
      throw new Error(`Video not found: ${videoId}`);
    }

    switch (step) {
      case 'downloading': {
        // Idempotency: skip if already downloaded
        if (video.audioPath && video.videoPath) {
          break;
        }

        const metadata = await this.services.download.fetchMetadata(video.url);

        // Store metadata returned from download service
        await this.db
          .update(videos)
          .set({
            title: metadata.title,
            description: metadata.description ?? undefined,
            channelName: metadata.channelName,
            channelId: metadata.channelId,
            duration: metadata.duration,
            publishedAt: metadata.publishedAt ?? undefined,
            thumbnailPath: metadata.thumbnailPath ?? undefined,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(videos.id, videoId));

        const videoPath = await this.services.download.downloadVideo(videoId, video.url);
        const audioPath = await this.services.download.extractAudio(videoId, videoPath);

        await this.db
          .update(videos)
          .set({ videoPath, audioPath, updatedAt: sql`CURRENT_TIMESTAMP` })
          .where(eq(videos.id, videoId));
        break;
      }

      case 'transcribing': {
        // Idempotency: check transcript count via join would need extra query;
        // use a lighter heuristic: if summary exists, transcription has already
        // happened (summary depends on transcript). Otherwise, re-run.
        // For a cleaner check we simply always re-transcribe unless audio
        // is missing (which would cause an error anyway).
        const [fresh] = await this.db.select().from(videos).where(eq(videos.id, videoId));
        if (!fresh?.audioPath) {
          throw new Error('Audio path missing; downloading step must complete first');
        }

        await this.services.transcription.transcribe(videoId, fresh.audioPath);
        break;
      }

      case 'embedding': {
        // Idempotency: skip if chroma collection already created
        if (video.chromaCollectionId) {
          break;
        }

        // VectorStoreService returns the collection ID
        const collectionId = await this.services.vectorStore.storeVideoEmbeddings(
          videoId,
          [] // segments are fetched internally by the service from the DB
        );

        await this.db
          .update(videos)
          .set({ chromaCollectionId: collectionId, updatedAt: sql`CURRENT_TIMESTAMP` })
          .where(eq(videos.id, videoId));
        break;
      }

      case 'summarizing': {
        // Idempotency: skip if summary already present
        if (video.summary) {
          break;
        }

        const summary = await this.services.summarization.summarize(videoId);

        await this.db
          .update(videos)
          .set({ summary, updatedAt: sql`CURRENT_TIMESTAMP` })
          .where(eq(videos.id, videoId));
        break;
      }

      case 'tagging': {
        await this.services.tagger.autoTag(videoId);
        break;
      }
    }
  }

  private async setStatus(
    videoId: string,
    status: typeof videos.$inferSelect['status']
  ): Promise<void> {
    await this.db
      .update(videos)
      .set({ status, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(videos.id, videoId));
  }

  private async handleError(
    videoId: string,
    step: PipelineStepName,
    error: Error
  ): Promise<void> {
    await this.db
      .update(videos)
      .set({
        status: 'error',
        errorMessage: `[${step}] ${error.message}`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(videos.id, videoId));

    const errorEvent: PipelineErrorEvent = { videoId, step, error };
    this.emit('error', errorEvent);
  }
}
