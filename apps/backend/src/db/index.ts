import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { ulid } from 'ulid';
import * as schema from './schema.js';

// Database configuration
const DB_DIR = join(homedir(), '.local', 'share', 'video-knowledge');
const DB_PATH = join(DB_DIR, 'video-knowledge.db');

/**
 * Ensures the database directory exists
 */
async function ensureDatabaseDirectory(): Promise<void> {
  try {
    await mkdir(DB_DIR, { recursive: true });
  } catch (error) {
    // Directory might already exist, which is fine
    if (error instanceof Error && error.message.includes('EEXIST')) {
      return;
    }
    throw error;
  }
}

/**
 * Initialize database connection
 */
async function initializeDatabase(): Promise<Database> {
  // Ensure directory exists before creating database file
  await ensureDatabaseDirectory();

  // Create or open the database
  const sqlite = new Database(DB_PATH);

  // Enable foreign keys for cascade deletes
  sqlite.run('PRAGMA foreign_keys = ON;');

  // Auto-create tables if they don't exist
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      youtube_id TEXT NOT NULL UNIQUE,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      channel_name TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      duration INTEGER NOT NULL,
      published_at TEXT,
      thumbnail_path TEXT,
      video_path TEXT,
      audio_path TEXT,
      summary TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      chroma_collection_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS transcript_segments (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      start_time REAL NOT NULL,
      end_time REAL NOT NULL,
      text TEXT NOT NULL,
      language TEXT NOT NULL,
      segment_index INTEGER NOT NULL
    )
  `);
  sqlite.run('CREATE INDEX IF NOT EXISTS transcript_segments_video_id_idx ON transcript_segments(video_id)');
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      start_time REAL NOT NULL,
      end_time REAL NOT NULL,
      chapter_index INTEGER NOT NULL
    )
  `);
  sqlite.run('CREATE INDEX IF NOT EXISTS chapters_video_id_idx ON chapters(video_id)');
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#000000',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS video_tags (
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      source TEXT NOT NULL DEFAULT 'manual',
      PRIMARY KEY (video_id, tag_id)
    )
  `);
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'global',
      video_id TEXT REFERENCES videos(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  sqlite.run('CREATE INDEX IF NOT EXISTS chat_sessions_video_id_idx ON chat_sessions(video_id)');
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      citations TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  sqlite.run('CREATE INDEX IF NOT EXISTS chat_messages_session_id_idx ON chat_messages(session_id)');
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return sqlite;
}

// Global database instance
let dbInstance: ReturnType<typeof drizzle> | null = null;

/**
 * Get database instance (lazy initialization)
 */
export async function getDb() {
  if (!dbInstance) {
    const sqlite = await initializeDatabase();
    dbInstance = drizzle(sqlite, { schema });
  }
  return dbInstance;
}

/**
 * Generate ULID for primary keys
 */
export function generateId(): string {
  return ulid();
}

/**
 * Export Drizzle schema for migrations
 */
export { schema };
