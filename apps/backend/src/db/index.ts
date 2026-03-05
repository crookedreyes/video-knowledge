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
  sqlite.exec('PRAGMA foreign_keys = ON;');

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
