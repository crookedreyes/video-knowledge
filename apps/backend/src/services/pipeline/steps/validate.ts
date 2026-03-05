import { eq } from 'drizzle-orm';
import { videos } from '../../../db/schema.js';
import { generateId } from '../../../db/index.js';
import type { PipelineContext, VideoMetadata } from '../types.js';
import { homedir } from 'os';
import { join } from 'path';
import { mkdir } from 'fs/promises';

/**
 * Extract the YouTube video ID from a URL or ID string.
 */
export function extractYoutubeId(input: string): string | null {
  // Direct 11-char video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;

  try {
    const url = new URL(input);
    if (url.hostname === 'youtu.be') {
      return url.pathname.slice(1).split('?')[0];
    }
    const v = url.searchParams.get('v');
    if (v) return v;
  } catch {
    // not a URL
  }
  return null;
}

/**
 * Run yt-dlp --dump-json to fetch video metadata without downloading.
 */
async function fetchYtdlpMetadata(url: string): Promise<VideoMetadata> {
  const proc = Bun.spawn(['yt-dlp', '--dump-json', '--no-playlist', url], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`yt-dlp metadata fetch failed: ${stderr.trim()}`);
  }

  const info = JSON.parse(stdout) as Record<string, unknown>;

  return {
    youtubeId: info.id as string,
    url,
    title: (info.title as string) ?? 'Untitled',
    description: (info.description as string) ?? '',
    channelName: (info.channel as string) ?? (info.uploader as string) ?? '',
    channelId: (info.channel_id as string) ?? (info.uploader_id as string) ?? '',
    duration: (info.duration as number) ?? 0,
    publishedAt: (info.upload_date as string) ?? '',
    thumbnailUrl: (info.thumbnail as string) ?? undefined,
  };
}

/**
 * Step 1: Validate the URL, check for duplicates, fetch metadata via yt-dlp.
 * Returns the video DB id (creates a new record or reuses an existing pending one).
 */
export async function validateStep(ctx: PipelineContext): Promise<string> {
  ctx.emit({ videoId: ctx.videoId, step: 'validate', status: 'started' });

  // videoId here is the user-provided YouTube URL — resolve it
  const youtubeId = extractYoutubeId(ctx.videoId);
  if (!youtubeId) {
    throw new Error(`Invalid YouTube URL or ID: ${ctx.videoId}`);
  }

  // Check for duplicates
  const existing = await ctx.db
    .select({ id: videos.id, status: videos.status })
    .from(videos)
    .where(eq(videos.youtubeId, youtubeId))
    .limit(1);

  if (existing.length > 0 && existing[0].status === 'ready') {
    throw new Error(`Video ${youtubeId} already ingested (id: ${existing[0].id})`);
  }

  // Reuse an existing record that errored or is in a non-ready state
  if (existing.length > 0) {
    ctx.emit({
      videoId: existing[0].id,
      step: 'validate',
      status: 'progress',
      message: 'Reusing existing video record',
    });
    return existing[0].id;
  }

  // Fetch metadata
  ctx.emit({ videoId: ctx.videoId, step: 'validate', status: 'progress', message: 'Fetching metadata via yt-dlp' });
  const meta = await fetchYtdlpMetadata(`https://www.youtube.com/watch?v=${youtubeId}`);

  // Ensure data directory exists
  const dataDir = join(homedir(), '.local', 'share', 'video-knowledge', 'media', meta.youtubeId);
  await mkdir(dataDir, { recursive: true });

  // Create video record
  const id = generateId();
  await ctx.db.insert(videos).values({
    id,
    youtubeId: meta.youtubeId,
    url: meta.url,
    title: meta.title,
    description: meta.description,
    channelName: meta.channelName,
    channelId: meta.channelId,
    duration: meta.duration,
    publishedAt: meta.publishedAt,
    status: 'pending',
  });

  ctx.emit({ videoId: id, step: 'validate', status: 'completed', data: { title: meta.title, duration: meta.duration } });
  return id;
}
