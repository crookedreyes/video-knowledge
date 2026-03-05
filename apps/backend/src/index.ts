import { Hono } from "hono";
import type { HealthResponse } from "./types";
import { initializeDb } from "./db/client";
import { settings } from "./db/schema";
import { eq } from "drizzle-orm";

const app = new Hono();
const db = initializeDb();

// Health endpoint
app.get("/api/health", (c) => {
  const response: HealthResponse = {
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "0.0.1",
  };
  return c.json(response);
});

// Get all settings
app.get("/api/settings", (c) => {
  try {
    const allSettings = db.select().from(settings).all();
    return c.json(allSettings);
  } catch (error) {
    console.error("Error fetching settings:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Get single setting
app.get("/api/settings/:key", (c) => {
  try {
    const key = c.req.param("key");
    const settings_list = db
      .select()
      .from(settings)
      .where(eq(settings.key, key))
      .all();

    if (!settings_list || settings_list.length === 0) {
      return c.json({ error: "Setting not found" }, 404);
    }

    return c.json(settings_list[0]);
  } catch (error) {
    console.error("Error fetching setting:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Create/update setting (with key in body)
app.post("/api/settings", async (c) => {
  try {
    const body = await c.req.json();
    const { key, value } = body;

    if (!key || !value || typeof value !== "string") {
      return c.json({ error: "Invalid key or value provided" }, 400);
    }

    const existing = db
      .select()
      .from(settings)
      .where(eq(settings.key, key))
      .all();

    if (existing && existing.length > 0) {
      db.update(settings).set({ value }).where(eq(settings.key, key)).run();
    } else {
      db.insert(settings).values({ key, value }).run();
    }

    const result = db
      .select()
      .from(settings)
      .where(eq(settings.key, key))
      .all();

    return c.json(result && result.length > 0 ? result[0] : null);
  } catch (error) {
    console.error("Error saving setting:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Create/update setting (with key in path)
app.post("/api/settings/:key", async (c) => {
  try {
    const key = c.req.param("key");
    const body = await c.req.json();

    if (!body.value || typeof body.value !== "string") {
      return c.json({ error: "Invalid value provided" }, 400);
    }

    const existing = db
      .select()
      .from(settings)
      .where(eq(settings.key, key))
      .all();

    if (existing && existing.length > 0) {
      db.update(settings).set({ value: body.value }).where(eq(settings.key, key)).run();
    } else {
      db.insert(settings).values({ key, value: body.value }).run();
    }

    const result = db
      .select()
      .from(settings)
      .where(eq(settings.key, key))
      .all();

    return c.json(result && result.length > 0 ? result[0] : null);
  } catch (error) {
    console.error("Error saving setting:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default {
  port: 3000,
  fetch: app.fetch,
};
