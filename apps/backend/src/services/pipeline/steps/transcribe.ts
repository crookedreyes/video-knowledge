import { eq } from 'drizzle-orm';
import { videos, transcriptSegments } from '../../../db/schema.js';
import { generateId } from '../../../db/index.js';
import type { PipelineContext } from '../types.js';
import { homedir } from 'os';
import { join } from 'path';

/**
 * Parse whisper.cpp VTT output into timestamped segments.
 * whisper.cpp --output-vtt produces lines like:
 *   00:00:01.000 --> 00:00:04.000
 *   Some text here
 */
function parseWhisperVtt(vttText: string): Array<{ start: number; end: number; text: string }> {
  const segments: Array<{ start: number; end: number; text: string }> = [];
  const lines = vttText.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    const timeMatch = line.match(
      /^(\d{2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/
    );
    if (timeMatch) {
      const toSeconds = (h: string, m: string, s: string, ms: string) =>
        parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
      const start = toSeconds(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
      const end = toSeconds(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);
      const textLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '') {
        textLines.push(lines[i].trim());
        i++;
      }
      const text = textLines.join(' ').trim();
      if (text) segments.push({ start, end, text });
    } else {
      i++;
    }
  }
  return segments;
}

/**
 * Step 3: Run whisper.cpp on the WAV file, parse timestamped segments, store in DB.
 * Idempotent: clears existing segments before re-inserting.
 */
export async function transcribeStep(ctx: PipelineContext): Promise<void> {
  ctx.emit({ videoId: ctx.videoId, step: 'transcribe', status: 'started' });

  const rows = await ctx.db
    .select({ audioPath: videos.audioPath, youtubeId: videos.youtubeId })
    .from(videos)
    .where(eq(videos.id, ctx.videoId))
    .limit(1);

  if (rows.length === 0) throw new Error(`Video not found: ${ctx.videoId}`);
  const { audioPath, youtubeId } = rows[0];
  if (!audioPath) throw new Error(`No audio file for video ${ctx.videoId}`);

  await ctx.db.update(videos).set({ status: 'transcribing' }).where(eq(videos.id, ctx.videoId));

  const modelSize = ctx.config.get<string>('whisper.modelSize') ?? 'base';
  const threads = ctx.config.get<number>('whisper.threads') ?? 4;
  const language = ctx.config.get<string>('whisper.language') ?? 'auto';

  const dataDir = join(homedir(), '.local', 'share', 'video-knowledge', 'media', youtubeId);
  const outputBase = join(dataDir, youtubeId);

  ctx.emit({ videoId: ctx.videoId, step: 'transcribe', status: 'progress', message: 'Running whisper.cpp' });

  const whisperArgs = [
    '-m', join(homedir(), '.local', 'share', 'video-knowledge', 'models', `ggml-${modelSize}.bin`),
    '-f', audioPath,
    '--output-vtt',
    '--output-file', outputBase,
    '-t', String(threads),
  ];
  if (language !== 'auto') whisperArgs.push('-l', language);

  const proc = Bun.spawn(['whisper-cli', ...whisperArgs], { stdout: 'pipe', stderr: 'pipe' });
  const [, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  if (exitCode !== 0) throw new Error(`whisper transcription failed: ${stderr.trim()}`);

  const vttPath = `${outputBase}.vtt`;
  const vttText = await Bun.file(vttPath).text();
  const segments = parseWhisperVtt(vttText);

  ctx.emit({ videoId: ctx.videoId, step: 'transcribe', status: 'progress', message: `Parsed ${segments.length} segments` });

  // Clear existing segments (idempotent)
  await ctx.db.delete(transcriptSegments).where(eq(transcriptSegments.videoId, ctx.videoId));

  // Insert new segments
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    await ctx.db.insert(transcriptSegments).values({
      id: generateId(),
      videoId: ctx.videoId,
      startTime: seg.start,
      endTime: seg.end,
      text: seg.text,
      language: language === 'auto' ? 'en' : language,
      segmentIndex: i,
    });
  }

  ctx.emit({ videoId: ctx.videoId, step: 'transcribe', status: 'completed', data: { segmentCount: segments.length } });
}
