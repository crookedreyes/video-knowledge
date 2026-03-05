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
