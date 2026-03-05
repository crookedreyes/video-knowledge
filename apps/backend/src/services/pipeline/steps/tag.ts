import { eq, asc } from 'drizzle-orm';
import { videos, transcriptSegments, tags, videoTags } from '../../../db/schema.js';
import { generateId } from '../../../db/index.js';
import type { PipelineContext } from '../types.js';
import { LLMClient } from '../../llm.js';

const TAG_SYSTEM_PROMPT = `You are a content categorization expert. Given a video title, description, and transcript snippet,
output ONLY a JSON array of 5-10 topic tags (lowercase, hyphenated, no spaces). Example: ["machine-learning","python","data-science"].
No other text.`;

/**
 * Extract keywords from text using simple frequency analysis.
 * Returns the top N words (length >= 4, not in stoplist).
 */
function extractKeywords(text: string, topN: number = 5): string[] {
  const stopwords = new Set([
    'this', 'that', 'with', 'have', 'from', 'they', 'will', 'been', 'were',
    'when', 'what', 'your', 'some', 'more', 'also', 'into', 'just', 'like',
    'about', 'then', 'than', 'there', 'their', 'would', 'could', 'should',
    'which', 'these', 'those', 'very', 'even', 'such', 'each', 'much',
  ]);

  const freq: Map<string, number> = new Map();
  const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? [];
  for (const w of words) {
    if (!stopwords.has(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word]) => word);
}

/**
 * Step 6: Auto-tag the video using LLM + keyword extraction.
 * Idempotent: removes existing auto-tags before inserting new ones.
 */
export async function tagStep(ctx: PipelineContext): Promise<void> {
  ctx.emit({ videoId: ctx.videoId, step: 'tag', status: 'started' });

  await ctx.db.update(videos).set({ status: 'tagging' }).where(eq(videos.id, ctx.videoId));

  const videoRow = await ctx.db
    .select({ title: videos.title, description: videos.description })
    .from(videos)
    .where(eq(videos.id, ctx.videoId))
    .limit(1);

  if (videoRow.length === 0) throw new Error(`Video not found: ${ctx.videoId}`);
  const { title, description } = videoRow[0];

  const segs = await ctx.db
    .select({ text: transcriptSegments.text })
    .from(transcriptSegments)
    .where(eq(transcriptSegments.videoId, ctx.videoId))
    .orderBy(asc(transcriptSegments.segmentIndex));

  // Use first ~4000 chars of transcript for tagging context
  const transcriptSnippet = segs
    .map((s) => s.text)
    .join(' ')
    .slice(0, 4000);

  const llm = new LLMClient({
    baseUrl: ctx.config.get<string>('llm.baseUrl') ?? 'http://localhost:1234/v1',
    apiKey: ctx.config.get<string>('llm.apiKey') ?? '',
    chatModel: ctx.config.get<string>('llm.chatModel') ?? 'qwen3.5',
    embeddingModel: ctx.config.get<string>('llm.embeddingModel') ?? 'qwen3-embedding',
    temperature: ctx.config.get<number>('llm.temperature') ?? 0.7,
    maxTokens: ctx.config.get<number>('llm.maxTokens') ?? 4096,
  });

  ctx.emit({ videoId: ctx.videoId, step: 'tag', status: 'progress', message: 'Calling LLM for tags' });

  let llmTags: string[] = [];
  try {
    const raw = await llm.chat(
      `Title: ${title}\nDescription: ${description ?? ''}\nTranscript: ${transcriptSnippet}`,
      TAG_SYSTEM_PROMPT
    );
    // Extract JSON array from response (may have leading/trailing text)
    const match = raw.match(/\[[\s\S]*?\]/);
    if (match) {
      const parsed = JSON.parse(match[0]) as unknown;
      if (Array.isArray(parsed)) {
        llmTags = parsed.filter((t): t is string => typeof t === 'string').map((t) => t.toLowerCase().replace(/\s+/g, '-'));
      }
    }
  } catch {
    // LLM tagging failed — fall back to keywords only
  }

  // Keyword fallback
  const keywordTags = extractKeywords(`${title} ${description ?? ''} ${transcriptSnippet}`, 5);
  const allTags = Array.from(new Set([...llmTags, ...keywordTags])).slice(0, 15);

  ctx.emit({ videoId: ctx.videoId, step: 'tag', status: 'progress', message: `Storing ${allTags.length} tags` });

  // Remove existing auto-tags
  await ctx.db
    .delete(videoTags)
    .where(eq(videoTags.videoId, ctx.videoId));

  // Upsert tags and create associations
  for (const tagName of allTags) {
    // Find or create tag
    const existing = await ctx.db.select({ id: tags.id }).from(tags).where(eq(tags.name, tagName)).limit(1);
    let tagId: string;
    if (existing.length > 0) {
      tagId = existing[0].id;
    } else {
      tagId = generateId();
      await ctx.db.insert(tags).values({ id: tagId, name: tagName, color: '#6366f1' });
    }

    await ctx.db.insert(videoTags).values({ videoId: ctx.videoId, tagId, source: 'auto' });
  }

  ctx.emit({ videoId: ctx.videoId, step: 'tag', status: 'completed', data: { tagCount: allTags.length } });
}
