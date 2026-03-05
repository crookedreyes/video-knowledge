import EventEmitter from 'node:events';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { DEFAULT_SETTINGS } from '@vide-know/shared';
import { settings as settingsTable } from '../db/schema.js';

type Db = Awaited<ReturnType<typeof import('../db/index.js').getDb>>;

// Zod schema for all known settings keys and their value types
export const settingsSchema = z.object({
  'llm.provider': z.string(),
  'llm.baseUrl': z.string().url(),
  'llm.apiKey': z.string(),
  'llm.chatModel': z.string(),
  'llm.embeddingModel': z.string(),
  'llm.temperature': z.number().min(0).max(2),
  'llm.maxTokens': z.number().int().positive(),
  'whisper.modelSize': z.enum(['tiny', 'base', 'small', 'medium', 'large']),
  'whisper.language': z.string(),
  'whisper.threads': z.number().int().positive(),
  'docker.socketPath': z.string(),
  'chroma.port': z.number().int().min(1).max(65535),
  'chroma.image': z.string(),
  'backend.port': z.number().int().min(1).max(65535),
  'paths.data': z.string(),
  'rag.chunkSize': z.number().int().positive(),
  'rag.chunkOverlap': z.number().int().min(0),
  'rag.topK': z.number().int().positive(),
  'ui.theme': z.enum(['light', 'dark', 'system']),
}).partial();

export type SettingsUpdate = z.infer<typeof settingsSchema>;

interface ChangeEvent {
  key: string;
  value: unknown;
  oldValue: unknown;
}

export class ConfigService extends EventEmitter {
  private cache: Map<string, unknown> = new Map();
  private db: Db;

  constructor(db: Db) {
    super();
    this.db = db;
  }

  async initialize(): Promise<void> {
    const rows = await this.db.select().from(settingsTable);
    for (const row of rows) {
      this.cache.set(row.key, JSON.parse(row.value));
    }

    // Seed defaults for any missing keys
    const toInsert = Object.entries(DEFAULT_SETTINGS).filter(
      ([key]) => !this.cache.has(key)
    );

    for (const [key, defaultValue] of toInsert) {
      await this.db
        .insert(settingsTable)
        .values({ key, value: JSON.stringify(defaultValue) });
      this.cache.set(key, defaultValue);
    }
  }

  getAll(): Record<string, unknown> {
    return Object.fromEntries(this.cache);
  }

  get<T = unknown>(key: string): T | undefined {
    return this.cache.get(key) as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    const oldValue = this.cache.get(key);
    this.cache.set(key, value);

    await this.db
      .insert(settingsTable)
      .values({ key, value: JSON.stringify(value) })
      .onConflictDoUpdate({
        target: settingsTable.key,
        set: {
          value: JSON.stringify(value),
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      });

    const event: ChangeEvent = { key, value, oldValue };
    this.emit('change', event);
    this.emit(`change:${key}`, { value, oldValue });
  }

  async setMany(updates: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(updates)) {
      await this.set(key, value);
    }
  }
}
