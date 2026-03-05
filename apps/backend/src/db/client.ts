import { homedir, platform } from "os";
import { join } from "path";
import { mkdirSync } from "fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
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

  console.log(`Database initialized at ${dbPath}`);

  return db;
}

export function getDb() {
  return initializeDb();
}
