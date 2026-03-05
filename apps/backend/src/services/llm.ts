import type OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions.js';
import type { OpenAIClientManager } from './openai-client.js';
import type { ConfigService } from './config.js';

export type { ChatCompletionMessageParam };

export interface CompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export class LLMService {
  private clientManager: OpenAIClientManager;
  private configService: ConfigService;

  constructor(clientManager: OpenAIClientManager, configService: ConfigService) {
    this.clientManager = clientManager;
    this.configService = configService;
  }

  private getClient(): OpenAI {
    return this.clientManager.getClient();
  }

  private resolveOptions(options: CompletionOptions = {}): Required<CompletionOptions> {
    return {
      model: options.model ?? this.configService.get<string>('llm.chatModel') ?? 'gpt-4o',
      temperature: options.temperature ?? this.configService.get<number>('llm.temperature') ?? 0.7,
      maxTokens: options.maxTokens ?? this.configService.get<number>('llm.maxTokens') ?? 4096,
    };
  }

  async complete(
    messages: ChatCompletionMessageParam[],
    options: CompletionOptions = {}
  ): Promise<string> {
    const { model, temperature, maxTokens } = this.resolveOptions(options);

    const response = await this.getClient().chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    });

    return response.choices[0]?.message?.content ?? '';
  }

  async *stream(
    messages: ChatCompletionMessageParam[],
    options: CompletionOptions = {}
  ): AsyncGenerator<string> {
    const { model, temperature, maxTokens } = this.resolveOptions(options);

    const streamResponse = await this.getClient().chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    });

    for await (const chunk of streamResponse) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }
}
/**
 * OpenAI-compatible LLM client for LM Studio.
 * Handles chat completions and embedding generation.
 */
export class LLMClient {
  private baseUrl: string;
  private apiKey: string;
  private chatModel: string;
  private embeddingModel: string;
  private temperature: number;
  private maxTokens: number;

  constructor(opts: {
    baseUrl: string;
    apiKey: string;
    chatModel: string;
    embeddingModel: string;
    temperature: number;
    maxTokens: number;
  }) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
    this.chatModel = opts.chatModel;
    this.embeddingModel = opts.embeddingModel;
    this.temperature = opts.temperature;
    this.maxTokens = opts.maxTokens;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['Authorization'] = `Bearer ${this.apiKey}`;
    return h;
  }

  async chat(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: this.chatModel,
        messages,
        temperature: this.temperature,
        max_tokens: this.maxTokens,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LLM chat failed (${res.status}): ${text}`);
    }

    const data = await res.json() as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0].message.content.trim();
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: this.embeddingModel,
        input: texts,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LLM embed failed (${res.status}): ${text}`);
    }

    const data = await res.json() as {
      data: Array<{ embedding: number[] }>;
    };
    return data.data.map((d) => d.embedding);
  }
}
