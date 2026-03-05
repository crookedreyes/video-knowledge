export interface EmbeddingConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export class EmbeddingService {
  private config: EmbeddingConfig;

  constructor(config: EmbeddingConfig) {
    this.config = config;
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await fetch(`${this.config.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey || 'no-key'}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Embedding request failed (${response.status}): ${body}`);
    }

    const json = (await response.json()) as { data: { embedding: number[]; index: number }[] };
    // Sort by index to preserve input order
    const sorted = json.data.slice().sort((a, b) => a.index - b.index);
    return sorted.map((d) => d.embedding);
  }
}
