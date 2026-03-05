import type { ConfigService } from '../config.js';
import type { getDb } from '../../db/index.js';

export type Db = Awaited<ReturnType<typeof getDb>>;

export interface PipelineContext {
  videoId: string;
  db: Db;
  config: ConfigService;
  emit: (event: PipelineEvent) => void;
}

export type PipelineStepName =
  | 'validate'
  | 'download'
  | 'transcribe'
  | 'embed'
  | 'summarize'
  | 'tag';

export interface PipelineEvent {
  videoId: string;
  step: PipelineStepName | 'done' | 'error';
  status: 'started' | 'progress' | 'completed' | 'failed';
  message?: string;
  data?: Record<string, unknown>;
}

export interface VideoMetadata {
  youtubeId: string;
  url: string;
  title: string;
  description: string;
  channelName: string;
  channelId: string;
  duration: number;
  publishedAt: string;
  thumbnailUrl?: string;
}
