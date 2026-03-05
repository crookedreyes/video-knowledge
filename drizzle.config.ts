import type { Config } from 'drizzle-kit';
import { join } from 'path';
import { homedir } from 'os';

const dbPath = join(homedir(), '.local', 'share', 'video-knowledge', 'video-knowledge.db');

export default {
  schema: './apps/backend/src/db/schema.ts',
  out: './apps/backend/drizzle',
  driver: 'better-sqlite',
  dbCredentials: {
    url: dbPath,
  },
} satisfies Config;
