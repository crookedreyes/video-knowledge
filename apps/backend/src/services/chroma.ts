/**
 * Minimal ChromaDB HTTP client.
 * Covers collection creation, document upsert, and deletion.
 */
export class ChromaClient {
  private baseUrl: string;

  constructor(port: number) {
    this.baseUrl = `http://localhost:${port}`;
  }

  private async req<T>(path: string, opts?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ChromaDB ${opts?.method ?? 'GET'} ${path} failed (${res.status}): ${text}`);
    }
    return res.json() as Promise<T>;
  }

  async getOrCreateCollection(name: string): Promise<string> {
    const data = await this.req<{ id: string }>(`/api/v1/collections`, {
      method: 'POST',
      body: JSON.stringify({ name, get_or_create: true }),
    });
    return data.id;
  }

  async upsert(
    collectionId: string,
    items: {
      ids: string[];
      embeddings: number[][];
      documents: string[];
      metadatas: Record<string, string | number>[];
    }
  ): Promise<void> {
    await this.req(`/api/v1/collections/${collectionId}/upsert`, {
      method: 'POST',
      body: JSON.stringify(items),
    });
  }

  async deleteCollection(collectionId: string): Promise<void> {
    await this.req(`/api/v1/collections/${collectionId}`, { method: 'DELETE' });
  }
}
