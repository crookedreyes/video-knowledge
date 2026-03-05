import OpenAI from 'openai';
import type { ConfigService } from './config.js';

export function createOpenAIClient(settings: {
  baseUrl: string;
  apiKey: string;
}): OpenAI {
  return new OpenAI({
    baseURL: settings.baseUrl,
    apiKey: settings.apiKey || 'lm-studio', // OpenAI SDK requires non-empty key
  });
}

/**
 * Manages a singleton OpenAI client that re-instantiates when LLM settings change.
 */
export class OpenAIClientManager {
  private client: OpenAI;
  private configService: ConfigService;

  constructor(configService: ConfigService) {
    this.configService = configService;
    this.client = this.buildClient();

    // Re-create client whenever a relevant LLM setting changes
    configService.on('change', (event: { key: string }) => {
      if (event.key === 'llm.baseUrl' || event.key === 'llm.apiKey') {
        this.client = this.buildClient();
      }
    });
  }

  private buildClient(): OpenAI {
    const baseUrl = this.configService.get<string>('llm.baseUrl') ?? 'http://localhost:1234/v1';
    const apiKey = this.configService.get<string>('llm.apiKey') ?? '';
    return createOpenAIClient({ baseUrl, apiKey });
  }

  getClient(): OpenAI {
    return this.client;
  }
}
