import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).default(sql`(strftime('%s', 'now') * 1000)`),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).default(sql`(strftime('%s', 'now') * 1000)`),
});
