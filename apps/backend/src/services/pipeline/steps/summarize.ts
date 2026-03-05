import { eq, asc } from 'drizzle-orm';
import { videos, transcriptSegments } from '../../../db/schema.js';
import type { PipelineContext } from '../types.js';
import { LLMClient } from '../../llm.js';

const SUMMARY_SYSTEM_PROMPT = `You are an expert summarizer. Given a video transcript, write a concise,
informative summary (3-5 paragraphs) that captures the main topics, key insights, and conclusions.
Focus on content value. Do not include filler or meta-commentary.`;

/**
 * Step 5: Generate a video summary using the LLM.
 * Uses the full transcript text (truncated to ~8000 tokens if needed).
 */
export async function summarizeStep(ctx: PipelineContext): Promise<void> {
  ctx.emit({ videoId: ctx.videoId, step: 'summarize', status: 'started' });

  await ctx.db.update(videos).set({ status: 'summarizing' }).where(eq(videos.id, ctx.videoId));

  const segs = await ctx.db
    .select({ text: transcriptSegments.text })
    .from(transcriptSegments)
    .where(eq(transcriptSegments.videoId, ctx.videoId))
    .orderBy(asc(transcriptSegments.segmentIndex));

  if (segs.length === 0) throw new Error(`No transcript segments for video ${ctx.videoId}`);

  const fullText = segs.map((s) => s.text).join(' ');
  // Rough truncation to ~32000 chars (~8000 tokens)
  const truncated = fullText.length > 32000 ? fullText.slice(0, 32000) + '...' : fullText;

  const llm = new LLMClient({
    baseUrl: ctx.config.get<string>('llm.baseUrl') ?? 'http://localhost:1234/v1',
    apiKey: ctx.config.get<string>('llm.apiKey') ?? '',
    chatModel: ctx.config.get<string>('llm.chatModel') ?? 'qwen3.5',
    embeddingModel: ctx.config.get<string>('llm.embeddingModel') ?? 'qwen3-embedding',
    temperature: ctx.config.get<number>('llm.temperature') ?? 0.7,
    maxTokens: ctx.config.get<number>('llm.maxTokens') ?? 4096,
  });

  ctx.emit({ videoId: ctx.videoId, step: 'summarize', status: 'progress', message: 'Calling LLM for summary' });

  const summary = await llm.chat(
    `Here is the transcript of a video:\n\n${truncated}\n\nPlease write a summary.`,
    SUMMARY_SYSTEM_PROMPT
  );

  await ctx.db.update(videos).set({ summary }).where(eq(videos.id, ctx.videoId));

  ctx.emit({ videoId: ctx.videoId, step: 'summarize', status: 'completed', data: { summaryLength: summary.length } });
}
