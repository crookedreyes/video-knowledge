import { homedir, platform } from "os";
import { join } from "path";
import { mkdirSync } from "fs";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

export function getDataDir(): string {
  const home = homedir();

  switch (platform()) {
    case "darwin":
      return join(home, "Library", "Application Support", "vide-know");
    case "win32":
      return join(home, "AppData", "Local", "vide-know");
    case "linux":
    default:
      return join(home, ".config", "vide-know");
  }
}

export function initializeDb() {
  const dataDir = getDataDir();
  const dbPath = join(dataDir, "vide-know.db");

  // Ensure data directory exists
  mkdirSync(dataDir, { recursive: true });

  // Initialize database connection
  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite, { schema });

  // Create tables if they don't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      createdAt INTEGER DEFAULT (cast(strftime('%s', 'now') * 1000 as integer)),
      updatedAt INTEGER DEFAULT (cast(strftime('%s', 'now') * 1000 as integer))
    );
  `);

  console.log(`Database initialized at ${dbPath}`);

  return db;
}

export function getDb() {
  return initializeDb();
}
