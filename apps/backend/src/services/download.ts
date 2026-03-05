import EventEmitter from 'node:events';
import { mkdir, unlink, access } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { eq } from 'drizzle-orm';
import { videos } from '../db/schema.js';

type Db = Awaited<ReturnType<typeof import('../db/index.js').getDb>>;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VideoChapter {
  title: string;
  startTime: number;
  endTime: number;
}

export interface VideoMetadata {
  youtubeId: string;
  url: string;
  title: string;
  description: string;
  channelName: string;
  channelId: string;
  duration: number; // seconds
  publishedAt: string | null;
  thumbnailUrl: string | null;
  chapters: VideoChapter[];
}

export interface DownloadResult {
  videoPath: string;
  thumbnailPath: string | null;
}

export interface AudioResult {
  audioPath: string;
}

export interface ProgressEvent {
  videoId: string;
  percent: number;
  speed: string | null;
  eta: string | null;
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

const YOUTUBE_PATTERNS = [
  /^https?:\/\/(?:www\.)?youtube\.com\/watch\?.*v=([\w-]{11})/,
  /^https?:\/\/youtu\.be\/([\w-]{11})/,
  /^https?:\/\/(?:www\.)?youtube\.com\/shorts\/([\w-]{11})/,
  /^https?:\/\/(?:www\.)?youtube\.com\/embed\/([\w-]{11})/,
  /^https?:\/\/(?:m\.)?youtube\.com\/watch\?.*v=([\w-]{11})/,
];

/**
 * Extract the YouTube video ID from a URL.
 * Returns null if the URL is not a recognised YouTube URL.
 */
export function extractYoutubeId(url: string): string | null {
  for (const pattern of YOUTUBE_PATTERNS) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// ─── Data directory helpers ───────────────────────────────────────────────────

function dataDir(subdir: string): string {
  return join(homedir(), '.local', 'share', 'video-knowledge', subdir);
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function tryUnlink(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // ignore — file may not exist
  }
}

// ─── Progress line parser ─────────────────────────────────────────────────────

// yt-dlp progress lines look like:
//   [download]  42.3% of   87.23MiB at    2.31MiB/s ETA 00:30
const PROGRESS_RE =
  /\[download\]\s+([\d.]+)%\s+of\s+[\d.]+\S+\s+at\s+([\d.]+\S+\/s)\s+ETA\s+(\S+)/;

function parseProgress(line: string): { percent: number; speed: string; eta: string } | null {
  const m = line.match(PROGRESS_RE);
  if (!m) return null;
  return { percent: parseFloat(m[1]), speed: m[2], eta: m[3] };
}

// ─── Spawn helper ─────────────────────────────────────────────────────────────

interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Spawn a command, collect stdout/stderr, and optionally forward each stdout
 * line to an `onLine` callback (useful for progress parsing).
 */
async function spawnCollect(
  args: string[],
  onLine?: (line: string) => void
): Promise<SpawnResult> {
  const proc = Bun.spawn(args, {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdoutChunks: Uint8Array[] = [];
  const stderrChunks: Uint8Array[] = [];
  const decoder = new TextDecoder();
  let lineBuffer = '';

  async function consumeStream(
    stream: ReadableStream<Uint8Array>,
    chunks: Uint8Array[],
    isStdout: boolean
  ): Promise<void> {
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      if (isStdout && onLine) {
        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';
        for (const line of lines) {
          onLine(line);
        }
      }
    }
    if (isStdout && onLine && lineBuffer) {
      onLine(lineBuffer);
      lineBuffer = '';
    }
  }

  await Promise.all([
    consumeStream(proc.stdout, stdoutChunks, true),
    consumeStream(proc.stderr, stderrChunks, false),
  ]);

  const exitCode = await proc.exited;

  const concatBuffers = (chunks: Uint8Array[]) =>
    decoder.decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));

  return {
    stdout: concatBuffers(stdoutChunks),
    stderr: concatBuffers(stderrChunks),
    exitCode,
  };
}

// ─── DownloadService ──────────────────────────────────────────────────────────

export class DownloadService extends EventEmitter {
  private db: Db;
  private ytdlpBin: string;

  /**
   * @param db        Drizzle database instance
   * @param ytdlpBin  Path to the yt-dlp binary (defaults to "yt-dlp" on PATH)
   */
  constructor(db: Db, ytdlpBin = 'yt-dlp') {
    super();
    this.db = db;
    this.ytdlpBin = ytdlpBin;
  }

  // ── URL validation ──────────────────────────────────────────────────────────

  /**
   * Validate that the URL points to a YouTube video and return the video ID.
   * Throws if the URL is not a recognised YouTube URL format.
   */
  validateUrl(url: string): string {
    const id = extractYoutubeId(url);
    if (!id) {
      throw new Error(`Invalid or unsupported YouTube URL: ${url}`);
    }
    return id;
  }

  // ── Duplicate detection ─────────────────────────────────────────────────────

  /**
   * Returns the existing video row if this YouTube ID is already in the DB,
   * otherwise returns null.
   */
  async findExisting(youtubeId: string) {
    const rows = await this.db
      .select()
      .from(videos)
      .where(eq(videos.youtubeId, youtubeId))
      .limit(1);
    return rows[0] ?? null;
  }

  // ── Metadata ────────────────────────────────────────────────────────────────

  /**
   * Fetch video metadata using `yt-dlp --dump-json`.
   */
  async fetchMetadata(url: string): Promise<VideoMetadata> {
    const youtubeId = this.validateUrl(url);

    const { stdout, exitCode, stderr } = await spawnCollect([
      this.ytdlpBin,
      '--dump-json',
      '--no-playlist',
      url,
    ]);

    if (exitCode !== 0) {
      throw new Error(`yt-dlp metadata fetch failed (exit ${exitCode}): ${stderr.trim()}`);
    }

    let info: Record<string, unknown>;
    try {
      info = JSON.parse(stdout.trim());
    } catch {
      throw new Error(`Failed to parse yt-dlp JSON output: ${stdout.slice(0, 200)}`);
    }

    const rawChapters = Array.isArray(info.chapters)
      ? (info.chapters as Array<{ title: string; start_time: number; end_time: number }>)
      : [];

    const chapters: VideoChapter[] = rawChapters.map((ch) => ({
      title: ch.title ?? '',
      startTime: ch.start_time ?? 0,
      endTime: ch.end_time ?? 0,
    }));

    return {
      youtubeId,
      url,
      title: String(info.title ?? ''),
      description: String(info.description ?? ''),
      channelName: String(info.uploader ?? info.channel ?? ''),
      channelId: String(info.uploader_id ?? info.channel_id ?? ''),
      duration: Number(info.duration ?? 0),
      publishedAt: info.upload_date ? String(info.upload_date) : null,
      thumbnailUrl: info.thumbnail ? String(info.thumbnail) : null,
      chapters,
    };
  }

  // ── Video download ──────────────────────────────────────────────────────────

  /**
   * Download video and thumbnail for the given URL.
   *
   * Emits `progress` events ({ videoId, percent, speed, eta }) while
   * downloading.  Cleans up partial files on failure.
   *
   * Throws if the YouTube ID is already present in the database.
   */
  async downloadVideo(url: string, videoId: string): Promise<DownloadResult> {
    const youtubeId = this.validateUrl(url);

    const existing = await this.findExisting(youtubeId);
    if (existing) {
      throw new Error(
        `Video ${youtubeId} already exists in the database (id: ${existing.id})`
      );
    }

    const videosDir = dataDir('videos');
    const thumbnailsDir = dataDir('thumbnails');
    await ensureDir(videosDir);
    await ensureDir(thumbnailsDir);

    const videoPath = join(videosDir, `${videoId}.mp4`);
    // Direct the thumbnail to the thumbnails directory via a separate -o template.
    const thumbTemplate = join(thumbnailsDir, `${videoId}.%(ext)s`);

    const args = [
      this.ytdlpBin,
      '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4',
      '-o', videoPath,
      '--write-thumbnail',
      '--convert-thumbnails', 'webp',
      '-o', `thumbnail:${thumbTemplate}`,
      '--no-playlist',
      url,
    ];

    let lastPercent = -1;

    try {
      const { exitCode, stderr } = await spawnCollect(args, (line) => {
        const progress = parseProgress(line);
        if (progress && progress.percent !== lastPercent) {
          lastPercent = progress.percent;
          const event: ProgressEvent = {
            videoId,
            percent: progress.percent,
            speed: progress.speed,
            eta: progress.eta,
          };
          this.emit('progress', event);
        }
      });

      if (exitCode !== 0) {
        throw new Error(`yt-dlp video download failed (exit ${exitCode}): ${stderr.trim()}`);
      }
    } catch (err) {
      await tryUnlink(videoPath);
      throw err;
    }

    const thumbnailPath = join(thumbnailsDir, `${videoId}.webp`);
    const thumbExists = await fileExists(thumbnailPath);

    return {
      videoPath,
      thumbnailPath: thumbExists ? thumbnailPath : null,
    };
  }

  // ── Audio extraction ────────────────────────────────────────────────────────

  /**
   * Extract 16 kHz mono WAV audio from an already-downloaded video file using
   * ffmpeg directly.
   *
   * Cleans up the output file on failure.
   */
  async extractAudio(videoPath: string, videoId: string): Promise<AudioResult> {
    const audioDir = dataDir('audio');
    await ensureDir(audioDir);

    const audioPath = join(audioDir, `${videoId}.wav`);

    const { exitCode } = await spawnCollect([
      'ffmpeg',
      '-y',
      '-i', videoPath,
      '-ar', '16000',
      '-ac', '1',
      '-c:a', 'pcm_s16le',
      audioPath,
    ]);

    if (exitCode !== 0) {
      await tryUnlink(audioPath);
      throw new Error(
        `ffmpeg audio extraction failed (exit ${exitCode}). Ensure ffmpeg is installed.`
      );
    }

    return { audioPath };
  }

  /**
   * Extract 16 kHz mono WAV audio directly from a YouTube URL using yt-dlp.
   * Use this when you do not have a pre-downloaded video file.
   *
   * Emits `progress` events while downloading.
   * Cleans up partial output on failure.
   */
  async extractAudioFromUrl(url: string, videoId: string): Promise<AudioResult> {
    this.validateUrl(url);

    const audioDir = dataDir('audio');
    await ensureDir(audioDir);

    const audioPath = join(audioDir, `${videoId}.wav`);
    // yt-dlp appends the extension; template without extension is intentional.
    const outputTemplate = join(audioDir, `${videoId}.%(ext)s`);

    const args = [
      this.ytdlpBin,
      '-x',
      '--audio-format', 'wav',
      '--postprocessor-args', 'ffmpeg:-ar 16000 -ac 1',
      '-o', outputTemplate,
      '--no-playlist',
      url,
    ];

    let lastPercent = -1;

    try {
      const { exitCode, stderr } = await spawnCollect(args, (line) => {
        const progress = parseProgress(line);
        if (progress && progress.percent !== lastPercent) {
          lastPercent = progress.percent;
          const event: ProgressEvent = {
            videoId,
            percent: progress.percent,
            speed: progress.speed,
            eta: progress.eta,
          };
          this.emit('progress', event);
        }
      });

      if (exitCode !== 0) {
        await tryUnlink(audioPath);
        throw new Error(
          `yt-dlp audio extraction failed (exit ${exitCode}): ${stderr.trim()}`
        );
      }
    } catch (err) {
      await tryUnlink(audioPath);
      throw err;
    }

    if (!(await fileExists(audioPath))) {
      throw new Error(
        `Audio extraction completed but output file not found at: ${audioPath}`
      );
    }

    return { audioPath };
  }
}
