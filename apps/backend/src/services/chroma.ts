/**
 * Minimal ChromaDB HTTP client (v2 API).
 * Covers collection creation, document upsert, and deletion.
 */
export class ChromaClient {
  private baseUrl: string;
  private apiBase: string;

  constructor(port: number) {
    this.baseUrl = `http://localhost:${port}`;
    this.apiBase = `${this.baseUrl}/api/v2/tenants/default_tenant/databases/default_database`;
  }

  private async req<T>(url: string, opts?: RequestInit): Promise<T> {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ChromaDB ${opts?.method ?? 'GET'} ${url} failed (${res.status}): ${text}`);
    }
    return res.json() as Promise<T>;
  }

  async getOrCreateCollection(name: string): Promise<string> {
    const data = await this.req<{ id: string }>(`${this.apiBase}/collections`, {
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
    await this.req(`${this.apiBase}/collections/${collectionId}/upsert`, {
      method: 'POST',
      body: JSON.stringify(items),
    });
  }

  async query(
    collectionId: string,
    queryEmbeddings: number[][],
    nResults: number,
    where?: Record<string, unknown>
  ): Promise<{
    ids: string[][];
    documents: (string | null)[][];
    metadatas: (Record<string, string | number> | null)[][];
    distances: number[][];
  }> {
    return this.req(`${this.apiBase}/collections/${collectionId}/query`, {
      method: 'POST',
      body: JSON.stringify({
        query_embeddings: queryEmbeddings,
        n_results: nResults,
        ...(where ? { where } : {}),
      }),
    });
  }

  async deleteWhere(collectionId: string, where: Record<string, unknown>): Promise<void> {
    await this.req(`${this.apiBase}/collections/${collectionId}/delete`, {
      method: 'POST',
      body: JSON.stringify({ where }),
    });
  }

  async deleteCollection(collectionId: string): Promise<void> {
    await this.req(`${this.apiBase}/collections/${collectionId}`, { method: 'DELETE' });
  }
}
