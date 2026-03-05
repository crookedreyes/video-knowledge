import { eq } from 'drizzle-orm';
import { videos } from '../../../db/schema.js';
import type { PipelineContext } from '../types.js';
import { homedir } from 'os';
import { join } from 'path';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';

function mediaDir(youtubeId: string): string {
  return join(homedir(), '.local', 'share', 'video-knowledge', 'media', youtubeId);
}

/**
 * Step 2: Download the video and extract 16kHz mono WAV audio for Whisper.
 * Idempotent: skips re-download if files already exist.
 */
export async function downloadStep(ctx: PipelineContext): Promise<void> {
  ctx.emit({ videoId: ctx.videoId, step: 'download', status: 'started' });

  const rows = await ctx.db
    .select({ youtubeId: videos.youtubeId, videoPath: videos.videoPath, audioPath: videos.audioPath })
    .from(videos)
    .where(eq(videos.id, ctx.videoId))
    .limit(1);

  if (rows.length === 0) throw new Error(`Video not found: ${ctx.videoId}`);
  const { youtubeId } = rows[0];
  const dir = mediaDir(youtubeId);
  await mkdir(dir, { recursive: true });

  const videoPath = join(dir, `${youtubeId}.mp4`);
  const audioPath = join(dir, `${youtubeId}.wav`);

  // Update status
  await ctx.db.update(videos).set({ status: 'downloading' }).where(eq(videos.id, ctx.videoId));

  // Download video (idempotent)
  if (!existsSync(videoPath)) {
    ctx.emit({ videoId: ctx.videoId, step: 'download', status: 'progress', message: 'Downloading video' });
    const ytUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
    const proc = Bun.spawn(
      ['yt-dlp', '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4', '-o', videoPath, ytUrl],
      { stdout: 'pipe', stderr: 'pipe' }
    );
    const [, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    if (exitCode !== 0) throw new Error(`yt-dlp download failed: ${stderr.trim()}`);
  } else {
    ctx.emit({ videoId: ctx.videoId, step: 'download', status: 'progress', message: 'Video file already exists, skipping download' });
  }

  // Extract audio (idempotent)
  if (!existsSync(audioPath)) {
    ctx.emit({ videoId: ctx.videoId, step: 'download', status: 'progress', message: 'Extracting audio' });
    const proc = Bun.spawn(
      ['ffmpeg', '-y', '-i', videoPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', audioPath],
      { stdout: 'pipe', stderr: 'pipe' }
    );
    const [, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    if (exitCode !== 0) throw new Error(`ffmpeg audio extraction failed: ${stderr.trim()}`);
  } else {
    ctx.emit({ videoId: ctx.videoId, step: 'download', status: 'progress', message: 'Audio file already exists, skipping extraction' });
  }

  await ctx.db.update(videos).set({ videoPath, audioPath }).where(eq(videos.id, ctx.videoId));
  ctx.emit({ videoId: ctx.videoId, step: 'download', status: 'completed', data: { videoPath, audioPath } });
}
