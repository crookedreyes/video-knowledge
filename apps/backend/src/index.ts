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
    const settingsObj: Record<string, string> = {};
    for (const setting of allSettings) {
      settingsObj[setting.key] = setting.value;
    }
    return c.json(settingsObj);
  } catch (error) {
    console.error("Error fetching settings:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Get single setting
app.get("/api/settings/:key", (c) => {
  try {
    const key = c.req.param("key");
    const setting = db
      .select()
      .from(settings)
      .where(eq(settings.key, key))
      .get();

    if (!setting) {
      return c.json({ error: "Setting not found" }, 404);
    }

    return c.json(setting);
  } catch (error) {
    console.error("Error fetching setting:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Create/update setting
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
      .get();

    let result;
    if (existing) {
      db.update(settings).set({ value: body.value }).where(eq(settings.key, key)).run();
      result = db
        .select()
        .from(settings)
        .where(eq(settings.key, key))
        .get();
    } else {
      db.insert(settings).values({ key, value: body.value }).run();
      result = db
        .select()
        .from(settings)
        .where(eq(settings.key, key))
        .get();
    }

    return c.json(result);
  } catch (error) {
    console.error("Error saving setting:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default {
  port: 3000,
  fetch: app.fetch,
};
