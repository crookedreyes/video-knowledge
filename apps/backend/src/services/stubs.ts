/**
 * Stub service implementations used until the real services from DEV-21,
 * DEV-22, DEV-24, DEV-25, and DEV-26 are integrated.
 *
 * Each stub throws a descriptive error so the pipeline can surface which
 * service is missing instead of silently failing.
 */

import type {
  IDownloadService,
  ITranscriptionService,
  IVectorStoreService,
  ISummarizationService,
  ITaggerService,
  VideoMetadata,
  TranscriptSegment,
} from './pipeline.js';

export class StubDownloadService implements IDownloadService {
  async fetchMetadata(_url: string): Promise<VideoMetadata> {
    throw new Error(
      'DownloadService not implemented yet (blocked on DEV-21: Implement yt-dlp download service)'
    );
  }

  async downloadVideo(_videoId: string, _url: string): Promise<string> {
    throw new Error('DownloadService not implemented yet (blocked on DEV-21)');
  }

  async extractAudio(_videoId: string, _videoPath: string): Promise<string> {
    throw new Error('DownloadService not implemented yet (blocked on DEV-21)');
  }
}

export class StubTranscriptionService implements ITranscriptionService {
  async transcribe(_videoId: string, _audioPath: string): Promise<TranscriptSegment[]> {
    throw new Error(
      'TranscriptionService not implemented yet (blocked on DEV-22: Implement whisper.cpp transcription service)'
    );
  }
}

export class StubVectorStoreService implements IVectorStoreService {
  async storeVideoEmbeddings(_videoId: string, _segments: TranscriptSegment[]): Promise<string> {
    throw new Error(
      'VectorStoreService not implemented yet (blocked on DEV-24: Implement transcript chunking and ChromaDB embedding storage)'
    );
  }
}

export class StubSummarizationService implements ISummarizationService {
  async summarize(_videoId: string): Promise<string> {
    throw new Error(
      'SummarizationService not implemented yet (blocked on DEV-25: Implement video summarization service)'
    );
  }
}

export class StubTaggerService implements ITaggerService {
  async autoTag(_videoId: string): Promise<string[]> {
    throw new Error(
      'TaggerService not implemented yet (blocked on DEV-26: Implement auto-tagging service)'
    );
  }
}
