import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { tags, videoTags, videos, transcriptSegments } from '../db/schema.js';
import type { ConfigService } from './config.js';

type Db = Awaited<ReturnType<typeof import('../db/index.js').getDb>>;

// ─── RAKE stopword list (common English words) ───────────────────────────────
const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
  'between', 'both', 'but', 'by', 'can', 'did', 'do', 'does', 'doing', 'down',
  'during', 'each', 'few', 'for', 'from', 'further', 'get', 'got', 'had', 'has',
  'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself',
  'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just',
  'let', 'me', 'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'now', 'of',
  'off', 'on', 'once', 'only', 'or', 'other', 'our', 'out', 'over', 'own', 're',
  's', 'same', 'she', 'should', 'so', 'some', 'such', 't', 'than', 'that', 'the',
  'their', 'theirs', 'them', 'then', 'there', 'these', 'they', 'this', 'those',
  'through', 'to', 'too', 'under', 'until', 'up', 'us', 'very', 'was', 'we',
  'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will',
  'with', 'would', 'you', 'your', 'yours', 'yourself',
]);

// Random hex color for new tags
function randomColor(): string {
  const hue = Math.floor(Math.random() * 360);
  const saturation = 55 + Math.floor(Math.random() * 25); // 55-80%
  const lightness = 35 + Math.floor(Math.random() * 20);  // 35-55%
  return hslToHex(hue, saturation, lightness);
}

function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const a = sNorm * Math.min(lNorm, 1 - lNorm);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = lNorm - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// ─── Keyword extraction (RAKE-style) ─────────────────────────────────────────

function extractKeywords(text: string, topN: number = 20): string[] {
  // Tokenize: lowercase, split on stopwords and punctuation
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);

  // Build candidate phrases: runs of non-stopword words
  const phrases: string[][] = [];
  let current: string[] = [];
  for (const word of words) {
    if (STOPWORDS.has(word) || word === '') {
      if (current.length > 0) {
        phrases.push(current);
        current = [];
      }
    } else {
      current.push(word);
    }
  }
  if (current.length > 0) phrases.push(current);

  // Word frequency and degree (co-occurrence in phrases)
  const freq = new Map<string, number>();
  const degree = new Map<string, number>();

  for (const phrase of phrases) {
    for (const word of phrase) {
      freq.set(word, (freq.get(word) ?? 0) + 1);
      degree.set(word, (degree.get(word) ?? 0) + phrase.length - 1);
    }
  }

  // Score = degree / frequency per word; phrase score = sum of word scores
  const wordScore = (w: string): number =>
    ((degree.get(w) ?? 0) + (freq.get(w) ?? 0)) / (freq.get(w) ?? 1);

  const phraseScores = new Map<string, number>();
  for (const phrase of phrases) {
    if (phrase.length === 0) continue;
    const key = phrase.join(' ');
    const score = phrase.reduce((s, w) => s + wordScore(w), 0);
    // Keep best score if same phrase appears multiple times
    if ((phraseScores.get(key) ?? 0) < score) {
      phraseScores.set(key, score);
    }
  }

  // Sort by score and return top N
  return [...phraseScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([phrase]) => phrase);
}

// Normalize: lowercase, trim, strip possessives
function normalizeTag(tag: string): string {
  return tag
    .toLowerCase()
    .trim()
    .replace(/'s$/, '');
}

// Basic singular form: remove trailing 's' for >4-char words
function toSingular(word: string): string {
  if (word.length > 4 && word.endsWith('s') && !word.endsWith('ss')) {
    return word.slice(0, -1);
  }
  return word;
}

// Deduplicate by normalized+singular form; return canonical forms
function deduplicateTags(tags: string[]): string[] {
  const seen = new Map<string, string>(); // normalized key -> canonical value
  for (const tag of tags) {
    const normalized = normalizeTag(tag);
    const key = toSingular(normalized);
    if (!seen.has(key)) {
      seen.set(key, normalized);
    }
  }
  return [...seen.values()];
}

// ─── LLM strategy ─────────────────────────────────────────────────────────────

async function extractTagsWithLLM(
  summary: string,
  transcriptExcerpt: string,
  config: ConfigService
): Promise<string[]> {
  const baseUrl = config.get<string>('llm.baseUrl') ?? 'http://localhost:1234/v1';
  const apiKey = config.get<string>('llm.apiKey') ?? '';
  const model = config.get<string>('llm.chatModel') ?? 'default';

  const prompt = `Extract 3-8 topic tags (technologies, concepts, techniques) from this video content. Return ONLY a JSON array of lowercase strings, no explanation.

Summary:
${summary}

Transcript excerpt:
${transcriptExcerpt}`;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM request failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const content = data.choices?.[0]?.message?.content?.trim() ?? '';

  // Extract JSON array from response (handle markdown code blocks)
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0 && t.length < 50);
}

// ─── TaggerService ─────────────────────────────────────────────────────────────

export class TaggerService {
  private db: Db;
  private config: ConfigService;

  constructor(db: Db, config: ConfigService) {
    this.db = db;
    this.config = config;
  }

  /**
   * Generate and store tags for a video using LLM + keyword extraction.
   * Existing tags are reused, new ones are created. All linked with source="auto".
   */
  async autoTag(videoId: string): Promise<string[]> {
    // 1. Fetch video and transcript
    const [video] = await this.db
      .select()
      .from(videos)
      .where(eq(videos.id, videoId));

    if (!video) {
      throw new Error(`Video not found: ${videoId}`);
    }

    const segments = await this.db
      .select({ text: transcriptSegments.text })
      .from(transcriptSegments)
      .where(eq(transcriptSegments.videoId, videoId))
      .orderBy(transcriptSegments.segmentIndex);

    const fullTranscript = segments.map((s) => s.text).join(' ');
    const transcriptExcerpt = fullTranscript.slice(0, 3000);

    // 2. LLM strategy
    let llmTags: string[] = [];
    if (video.summary && transcriptExcerpt) {
      try {
        llmTags = await extractTagsWithLLM(
          video.summary,
          transcriptExcerpt,
          this.config
        );
      } catch (err) {
        // LLM failure is non-fatal; keyword extraction is the fallback
        console.error('[TaggerService] LLM strategy failed, using keyword fallback:', err);
      }
    }

    // 3. Keyword extraction strategy
    const textForKeywords = [
      video.title,
      video.description ?? '',
      video.summary ?? '',
      fullTranscript,
    ]
      .filter(Boolean)
      .join(' ');

    const keywordTags = extractKeywords(textForKeywords, 20);

    // 4. Merge and deduplicate
    const combined = deduplicateTags([...llmTags, ...keywordTags]).slice(0, 15);

    if (combined.length === 0) return [];

    // 5. Find existing tags (case-insensitive via normalized lookup)
    const existingTags = await this.db.select().from(tags);
    const existingByNorm = new Map(
      existingTags.map((t) => [toSingular(t.name.toLowerCase()), t])
    );

    const tagIdsToLink: string[] = [];
    for (const tagName of combined) {
      const key = toSingular(tagName);
      const existing = existingByNorm.get(key);

      if (existing) {
        tagIdsToLink.push(existing.id);
      } else {
        // Create new tag
        const newId = ulid();
        await this.db.insert(tags).values({
          id: newId,
          name: tagName,
          color: randomColor(),
        });
        tagIdsToLink.push(newId);
        // Add to map so duplicates within this batch are also resolved
        existingByNorm.set(key, { id: newId, name: tagName, color: '#000000', createdAt: '' });
      }
    }

    // 6. Find which video_tags links already exist
    const existingLinks = await this.db
      .select({ tagId: videoTags.tagId })
      .from(videoTags)
      .where(eq(videoTags.videoId, videoId));

    const linkedTagIds = new Set(existingLinks.map((l) => l.tagId));
    const newLinks = tagIdsToLink.filter((id) => !linkedTagIds.has(id));

    // 7. Insert new video_tags links
    for (const tagId of newLinks) {
      await this.db
        .insert(videoTags)
        .values({ videoId, tagId, source: 'auto' })
        .onConflictDoNothing();
    }

    return tagIdsToLink;
  }
}
