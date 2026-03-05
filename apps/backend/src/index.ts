import { Hono } from "hono";
import type { HealthResponse } from "./types";

const app = new Hono();

app.get("/health", (c) => {
  const response: HealthResponse = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "0.0.1",
  };
  return c.json(response);
});

export default app;
