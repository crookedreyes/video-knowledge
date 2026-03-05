import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  driver: "bun-sqlite",
  dbCredentials: {
    url: "file:./vide-know.db",
  },
} satisfies Config;
