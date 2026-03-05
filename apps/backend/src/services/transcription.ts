import EventEmitter from 'node:events';
import { spawn } from 'node:child_process';
import { mkdir, access, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { transcriptSegments } from '../db/schema.js';
import { generateId } from '../db/index.js';

type Db = Awaited<ReturnType<typeof import('../db/index.js').getDb>>;

export interface TranscriptSegment {
  startTime: number;
  endTime: number;
  text: string;
  language: string;
}

type ModelSize = 'tiny' | 'base' | 'small' | 'medium' | 'large';

// HuggingFace model filenames for each size
const MODEL_FILES: Record<ModelSize, string> = {
  tiny: 'ggml-tiny.bin',
  base: 'ggml-base.bin',
  small: 'ggml-small.bin',
  medium: 'ggml-medium.bin',
  large: 'ggml-large-v3.bin',
};

const HUGGINGFACE_BASE =
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';

const MODELS_DIR = join(
  homedir(),
  '.local',
  'share',
  'video-knowledge',
  'whisper-models'
);

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export interface TranscriptionOptions {
  modelSize?: ModelSize;
  language?: string;
  threads?: number;
  timeoutMs?: number;
}

export interface TranscriptionProgress {
  type: 'download' | 'transcription';
  percent: number;
}

export class TranscriptionService extends EventEmitter {
  private db: Db;

  constructor(db: Db) {
    super();
    this.db = db;
  }

  /**
   * Ensure the whisper models directory exists.
   */
  private async ensureModelsDir(): Promise<void> {
    await mkdir(MODELS_DIR, { recursive: true });
  }

  /**
   * Return the path to the model binary, downloading it first if needed.
   */
  private async resolveModel(size: ModelSize): Promise<string> {
    await this.ensureModelsDir();
    const filename = MODEL_FILES[size];
    const modelPath = join(MODELS_DIR, filename);

    try {
      await access(modelPath);
      // Verify file has non-zero size (incomplete previous download)
      const info = await stat(modelPath);
      if (info.size > 0) {
        return modelPath;
      }
    } catch {
      // File does not exist — fall through to download
    }

    await this.downloadModel(size, modelPath);
    return modelPath;
  }

  /**
   * Download a whisper model from HuggingFace with progress reporting.
   */
  private async downloadModel(size: ModelSize, destPath: string): Promise<void> {
    const url = `${HUGGINGFACE_BASE}/${MODEL_FILES[size]}`;

    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(
        `Failed to download model ${size}: HTTP ${response.status} from ${url}`
      );
    }

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    let received = 0;

    const fileStream = createWriteStream(destPath);

    await new Promise<void>((resolve, reject) => {
      const reader = response.body!.getReader();

      const pump = async (): Promise<void> => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fileStream.write(value);
            received += value.byteLength;
            if (total > 0) {
              const percent = Math.floor((received / total) * 100);
              this.emit('progress', { type: 'download', percent } satisfies TranscriptionProgress);
            }
          }
          fileStream.end();
          fileStream.once('finish', resolve);
          fileStream.once('error', reject);
        } catch (err) {
          fileStream.destroy();
          reject(err);
        }
      };

      pump().catch(reject);
    });
  }

  /**
   * Transcribe an audio file and store the resulting segments.
   *
   * @param audioPath Absolute path to the .wav audio file
   * @param videoId   The video record ID the transcript belongs to
   * @param options   Optional overrides for model size, language, threads, timeout
   * @returns         Array of stored transcript segments
   */
  async transcribe(
    audioPath: string,
    videoId: string,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptSegment[]> {
    const modelSize: ModelSize = (options.modelSize ?? 'base') as ModelSize;
    const language = options.language ?? 'auto';
    const threads = options.threads ?? 4;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    // Resolve / download model
    const modelPath = await this.resolveModel(modelSize);

    // Build whisper-cpp args
    const args = [
      '-m', modelPath,
      '-f', audioPath,
      '-ojson',
      '--language', language,
      '--print-progress',
      '-t', String(threads),
    ];

    const rawJson = await this.runWhisper(args, timeoutMs);
    const segments = this.parseWhisperOutput(rawJson, language);

    await this.storeSegments(videoId, segments);

    return segments;
  }

  /**
   * Spawn the whisper-cpp process and collect stdout JSON.
   * Progress is extracted from stderr lines.
   */
  private runWhisper(args: string[], timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      let proc: ReturnType<typeof spawn>;

      try {
        proc = spawn('whisper-cli', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        reject(new Error(`whisper-cpp binary not found or failed to start: ${msg}`));
        return;
      }

      // Handle ENOENT specifically — binary not on PATH
      proc.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') {
          reject(
            new Error(
              'whisper-cpp binary not found. Please install whisper.cpp and ensure it is on your PATH.'
            )
          );
        } else {
          reject(new Error(`whisper-cpp process error: ${err.message}`));
        }
      });

      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(
          new Error(
            `Transcription timed out after ${Math.round(timeoutMs / 60000)} minutes`
          )
        );
      }, timeoutMs);

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      proc.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
        // Parse progress lines like: "whisper_print_progress_callback: progress = 42%"
        const match = stderr.match(/progress\s*=\s*(\d+)%/);
        if (match) {
          const percent = parseInt(match[1], 10);
          this.emit('progress', { type: 'transcription', percent } satisfies TranscriptionProgress);
        }
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(
            new Error(
              `whisper-cpp exited with code ${code}. stderr: ${stderr.slice(-500)}`
            )
          );
        }
      });
    });
  }

  /**
   * Parse whisper.cpp JSON output into TranscriptSegment[].
   *
   * whisper.cpp -ojson produces:
   * {
   *   "transcription": [
   *     { "timestamps": { "from": "00:00:00,000", "to": "00:00:02,000" }, "text": "..." },
   *     ...
   *   ]
   * }
   */
  private parseWhisperOutput(json: string, defaultLanguage: string): TranscriptSegment[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error(`Failed to parse whisper-cpp JSON output: ${json.slice(0, 200)}`);
    }

    const obj = parsed as Record<string, unknown>;
    const transcription = obj['transcription'];
    if (!Array.isArray(transcription)) {
      throw new Error('Unexpected whisper-cpp output format: missing "transcription" array');
    }

    return (transcription as Array<Record<string, unknown>>).map((item) => {
      const timestamps = item['timestamps'] as Record<string, string> | undefined;
      const from = timestamps?.['from'] ?? '00:00:00,000';
      const to = timestamps?.['to'] ?? '00:00:00,000';
      const text = (item['text'] as string ?? '').trim();

      // Detect language from output if available, fall back to default
      const lang =
        (item['language'] as string | undefined) ??
        (defaultLanguage === 'auto' ? 'unknown' : defaultLanguage);

      return {
        startTime: this.parseTimestamp(from),
        endTime: this.parseTimestamp(to),
        text,
        language: lang,
      };
    });
  }

  /**
   * Convert "HH:MM:SS,mmm" to seconds.
   */
  private parseTimestamp(ts: string): number {
    // Format: "00:01:23,456"
    const [timePart, msPart] = ts.split(',');
    const [h, m, s] = (timePart ?? '0:0:0').split(':').map(Number);
    const ms = parseInt(msPart ?? '0', 10);
    return (h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0) + (ms ?? 0) / 1000;
  }

  /**
   * Persist segments to the transcript_segments table.
   */
  private async storeSegments(
    videoId: string,
    segments: TranscriptSegment[]
  ): Promise<void> {
    if (segments.length === 0) return;

    const rows = segments.map((seg, index) => ({
      id: generateId(),
      videoId,
      startTime: seg.startTime,
      endTime: seg.endTime,
      text: seg.text,
      language: seg.language,
      segmentIndex: index,
    }));

    // Insert in a single batch
    await this.db.insert(transcriptSegments).values(rows);
  }
}
