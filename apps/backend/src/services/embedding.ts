import type OpenAI from 'openai';
import type { OpenAIClientManager } from './openai-client.js';
import type { ConfigService } from './config.js';

export interface EmbeddingOptions {
  model?: string;
  batchSize?: number;
}

export class EmbeddingService {
  private clientManager: OpenAIClientManager;
  private configService: ConfigService;

  constructor(clientManager: OpenAIClientManager, configService: ConfigService) {
    this.clientManager = clientManager;
    this.configService = configService;
  }

  private getClient(): OpenAI {
    return this.clientManager.getClient();
  }

  private getModel(model?: string): string {
    return model ?? this.configService.get<string>('llm.embeddingModel') ?? 'text-embedding-3-small';
  }

  async embed(texts: string[], options: EmbeddingOptions = {}): Promise<number[][]> {
    const model = this.getModel(options.model);
    const batchSize = options.batchSize ?? 100;

    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const response = await this.getClient().embeddings.create({
        model,
        input: batch,
      });

      // Sort by index to maintain order
      const sorted = response.data.sort((a, b) => a.index - b.index);
      results.push(...sorted.map((item) => item.embedding));
    }

    return results;
  }

  async embedSingle(text: string, options: EmbeddingOptions = {}): Promise<number[]> {
    const results = await this.embed([text], options);
    return results[0] ?? [];
  }
}
