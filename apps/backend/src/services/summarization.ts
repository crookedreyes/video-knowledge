import { eq, asc } from 'drizzle-orm';
import { videos, transcriptSegments } from '../db/schema.js';
import type { ConfigService } from './config.js';

type Db = Awaited<ReturnType<typeof import('../db/index.js').getDb>>;

// Approximate token count: 1 token ≈ 4 characters
const CHARS_PER_TOKEN = 4;
const SHORT_TRANSCRIPT_TOKEN_LIMIT = 8_000;
// Each map chunk targets ~6K tokens to leave headroom for prompt overhead
const CHUNK_TOKEN_SIZE = 6_000;
const CHUNK_CHAR_SIZE = CHUNK_TOKEN_SIZE * CHARS_PER_TOKEN;
// Default LLM call timeout: 120 seconds
const DEFAULT_TIMEOUT_MS = 120_000;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

const SYSTEM_PROMPT = `You are an expert video content analyst. When given a video transcript, produce a structured summary in well-formatted Markdown.

Your response MUST follow this exact structure:

# [Video Title]

## Key Topics
- Topic 1
- Topic 2
- (3–7 bullet points)

## Main Points
- Point 1
- Point 2
- (5–10 bullet points covering the most important takeaways)

## Summary
[2–3 paragraphs providing a flowing, comprehensive summary of the video content]

Be accurate, concise, and focus on the most valuable information for the viewer.`;

const CHUNK_SYSTEM_PROMPT = `You are an expert video content analyst. You will receive a portion of a video transcript. Produce a concise intermediate summary of this section in well-formatted Markdown.

Your response MUST follow this structure:

## Key Points from This Section
- Point 1
- Point 2
- (up to 5 bullet points)

## Section Summary
[1–2 paragraphs summarizing this section]`;

const REDUCE_SYSTEM_PROMPT = `You are an expert video content analyst. You will receive a series of intermediate summaries of sections of a video. Combine them into a single cohesive structured summary in well-formatted Markdown.

Your response MUST follow this exact structure:

# [Video Title]

## Key Topics
- Topic 1
- Topic 2
- (3–7 bullet points)

## Main Points
- Point 1
- Point 2
- (5–10 bullet points covering the most important takeaways)

## Summary
[2–3 paragraphs providing a flowing, comprehensive summary of the video content]

Be accurate, concise, and focus on the most valuable information for the viewer.`;

interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  chatModel: string;
  temperature: number;
  maxTokens: number;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function callLlm(
  config: LlmConfig,
  messages: ChatMessage[],
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.chatModel,
        messages,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(`LLM request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '(unreadable)');
    throw new Error(`LLM API error ${response.status}: ${body}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('LLM returned an unexpected response shape');
  }

  return content.trim();
}

function splitIntoChunks(text: string, chunkCharSize: number): string[] {
  const chunks: string[] = [];
  let offset = 0;

  while (offset < text.length) {
    const end = Math.min(offset + chunkCharSize, text.length);
    // Try to break on a sentence boundary (period + space or newline)
    let splitAt = end;
    if (end < text.length) {
      const lookback = Math.max(end - 500, offset);
      const slice = text.slice(lookback, end);
      const lastBreak = Math.max(
        slice.lastIndexOf('. '),
        slice.lastIndexOf('.\n'),
        slice.lastIndexOf('? '),
        slice.lastIndexOf('! ')
      );
      if (lastBreak > 0) {
        splitAt = lookback + lastBreak + 2;
      }
    }
    chunks.push(text.slice(offset, splitAt).trim());
    offset = splitAt;
  }

  return chunks.filter((c) => c.length > 0);
}

export class SummarizationService {
  private db: Db;
  private configService: ConfigService;

  constructor(db: Db, configService: ConfigService) {
    this.db = db;
    this.configService = configService;
  }

  private getLlmConfig(): LlmConfig {
    return {
      baseUrl: this.configService.get<string>('llm.baseUrl') ?? 'http://localhost:1234/v1',
      apiKey: this.configService.get<string>('llm.apiKey') ?? '',
      chatModel: this.configService.get<string>('llm.chatModel') ?? 'default',
      temperature: this.configService.get<number>('llm.temperature') ?? 0.7,
      maxTokens: this.configService.get<number>('llm.maxTokens') ?? 4096,
    };
  }

  async summarize(videoId: string): Promise<string> {
    // 1. Fetch video metadata
    const [video] = await this.db
      .select()
      .from(videos)
      .where(eq(videos.id, videoId));

    if (!video) {
      throw new Error(`Video not found: ${videoId}`);
    }

    // 2. Fetch transcript segments in order
    const segments = await this.db
      .select()
      .from(transcriptSegments)
      .where(eq(transcriptSegments.videoId, videoId))
      .orderBy(asc(transcriptSegments.segmentIndex));

    if (segments.length === 0) {
      throw new Error(`No transcript segments found for video: ${videoId}`);
    }

    const fullTranscript = segments.map((s) => s.text).join(' ');
    const tokenCount = estimateTokens(fullTranscript);

    const llmConfig = this.getLlmConfig();
    let summary: string;

    if (tokenCount < SHORT_TRANSCRIPT_TOKEN_LIMIT) {
      // Short path: single prompt
      summary = await this.summarizeShort(video.title, fullTranscript, llmConfig);
    } else {
      // Long path: map-reduce
      summary = await this.summarizeLong(video.title, fullTranscript, llmConfig);
    }

    // 3. Store summary in database
    await this.db
      .update(videos)
      .set({
        summary,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(videos.id, videoId));

    return summary;
  }

  private async summarizeShort(
    title: string,
    transcript: string,
    config: LlmConfig
  ): Promise<string> {
    const userMessage = `Video title: "${title}"\n\nTranscript:\n${transcript}`;

    return callLlm(config, [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ]);
  }

  private async summarizeLong(
    title: string,
    transcript: string,
    config: LlmConfig
  ): Promise<string> {
    // Map phase: summarize each chunk independently
    const chunks = splitIntoChunks(transcript, CHUNK_CHAR_SIZE);

    const chunkSummaries: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkSummary = await callLlm(config, [
        { role: 'system', content: CHUNK_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Part ${i + 1} of ${chunks.length} from video "${title}":\n\n${chunks[i]}`,
        },
      ]);
      chunkSummaries.push(chunkSummary);
    }

    // Reduce phase: combine chunk summaries into final summary
    const combinedSummaries = chunkSummaries
      .map((s, i) => `### Part ${i + 1} Summary\n${s}`)
      .join('\n\n---\n\n');

    return callLlm(config, [
      { role: 'system', content: REDUCE_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Video title: "${title}"\n\nIntermediate section summaries:\n\n${combinedSummaries}`,
      },
    ]);
  }
}
