import { ChromaClient } from './chroma.js';
import type { ConfigService } from './config.js';

const COLLECTION_NAME = 'video_transcripts';

export interface RawSearchResult {
  videoId: string;
  text: string;
  distance: number;
  startTime: number;
  endTime: number;
}

export class VectorStoreService {
  private chroma: ChromaClient;

  constructor(_embeddingService: unknown, configService: ConfigService) {
    const port = configService.get<number>('chroma.port') ?? 8000;
    this.chroma = new ChromaClient(port);
  }

  async query(
    queryEmbedding: number[],
    nResults: number,
    videoIds?: string[]
  ): Promise<RawSearchResult[]> {
    const collectionId = await this.chroma.getOrCreateCollection(COLLECTION_NAME);

    let where: Record<string, unknown> | undefined;
    if (videoIds && videoIds.length === 1) {
      where = { videoId: videoIds[0] };
    } else if (videoIds && videoIds.length > 1) {
      where = { videoId: { $in: videoIds } };
    }

    const results = await this.chroma.query(collectionId, [queryEmbedding], nResults, where);

    const ids = results.ids[0] ?? [];
    const documents = results.documents[0] ?? [];
    const distances = results.distances[0] ?? [];
    const metadatas = results.metadatas[0] ?? [];

    return ids.map((_, i) => {
      const meta = metadatas[i] as Record<string, unknown> | null ?? {};
      return {
        videoId: String(meta.videoId ?? ''),
        text: documents[i] ?? '',
        distance: distances[i] ?? 0,
        startTime: Number(meta.startTime ?? 0),
        endTime: Number(meta.endTime ?? 0),
      };
    });
  }

  async deleteVideoEmbeddings(videoId: string): Promise<void> {
    const collectionId = await this.chroma.getOrCreateCollection(COLLECTION_NAME);
    await this.chroma.deleteWhere(collectionId, { videoId });
  }
}
