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
