# Project Foundation & Scaffolding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Set up a fully functional Bun monorepo with Tauri desktop app, Hono backend, SQLite database, and app shell UI that boots with `bun dev`.

**Architecture:**
- Bun workspaces managing three packages (desktop app, backend server, shared types)
- Dev workflow: `bun dev` spawns Tauri window + Bun backend concurrently
- Backend API serves health checks and settings CRUD from SQLite
- Frontend renders navigable app shell with sidebar and settings page

**Tech Stack:** Bun, Tauri v2, React 19, Vite, Tailwind v4, shadcn/ui, Hono, SQLite, Drizzle ORM

---

## Phase 1: Monorepo Bootstrap

### Task 1.1: Initialize root workspace configuration

**Files:**
- Create: `bun.workspaces.json`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`

**Step 1: Create bun.workspaces.json**

```json
{
  "workspaces": [
    "apps/desktop",
    "apps/backend",
    "packages/shared"
  ]
}
```

Save to `/home/cr/code/vide-know/DEV-9/bun.workspaces.json`

**Step 2: Create root package.json**

```json
{
  "name": "vide-know",
  "version": "0.0.1",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "bun run dev:workspace",
    "dev:workspace": "bun run --cwd apps/backend dev & bun run --cwd apps/desktop tauri dev",
    "build": "bun run --cwd apps/desktop tauri build",
    "install": "bun install"
  },
  "devDependencies": {
    "typescript": "^5.3.3"
  }
}
```

Save to `/home/cr/code/vide-know/DEV-9/package.json`

**Step 3: Create tsconfig.json (root)**

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "skipLibCheck": true
  }
}
```

Save to `/home/cr/code/vide-know/DEV-9/tsconfig.json`

**Step 4: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist"
  }
}
```

Save to `/home/cr/code/vide-know/DEV-9/tsconfig.base.json`

**Step 5: Create .gitignore**

```
node_modules
dist
target
*.log
.DS_Store
.env
.env.local
*.pem
src-tauri/target
*.deb
*.dmg
*.exe
*.msi
*.AppImage
.vscode
.idea
.vite
.tauri
```

Save to `/home/cr/code/vide-know/DEV-9/.gitignore`

**Step 6: Run initial setup**

```bash
cd /home/cr/code/vide-know/DEV-9
bun install
```

Expected: Creates `bun.lockb` file, no errors

**Step 7: Commit**

```bash
cd /home/cr/code/vide-know/DEV-9
git add bun.workspaces.json package.json tsconfig.json tsconfig.base.json .gitignore
git commit -m "chore: initialize bun workspaces monorepo"
```

---

## Phase 2: Backend Scaffold

### Task 2.1: Set up backend package structure

**Files:**
- Create: `apps/backend/package.json`
- Create: `apps/backend/tsconfig.json`
- Create: `apps/backend/src/index.ts`
- Create: `apps/backend/src/types.ts`

**Step 1: Create backend package.json**

```json
{
  "name": "@vide-know/backend",
  "version": "0.0.1",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "dev": "bun run src/index.ts --hot",
    "build": "tsc",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "hono": "^3.11.0",
    "drizzle-orm": "^0.29.0",
    "drizzle-kit": "^0.20.0",
    "better-sqlite3": "^9.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "typescript": "^5.3.3"
  }
}
```

Save to `/home/cr/code/vide-know/DEV-9/apps/backend/package.json`

**Step 2: Create backend tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "moduleResolution": "bundler"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

Save to `/home/cr/code/vide-know/DEV-9/apps/backend/tsconfig.json`

**Step 3: Create backend src directory structure**

```bash
mkdir -p /home/cr/code/vide-know/DEV-9/apps/backend/src/db
mkdir -p /home/cr/code/vide-know/DEV-9/apps/backend/src/routes
```

**Step 4: Create src/types.ts**

```typescript
export interface HealthResponse {
  status: "ok";
  timestamp: string;
}

export interface SettingsResponse {
  [key: string]: string;
}
```

Save to `/home/cr/code/vide-know/DEV-9/apps/backend/src/types.ts`

**Step 5: Create src/index.ts (placeholder, will update in next task)**

```typescript
import { Hono } from "hono";

const app = new Hono();

// Health endpoint
app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

const PORT = process.env.PORT || 3001;

console.log(`Server starting on http://localhost:${PORT}`);

export default {
  port: PORT,
  fetch: app.fetch,
};
```

Save to `/home/cr/code/vide-know/DEV-9/apps/backend/src/index.ts`

**Step 6: Install backend dependencies**

```bash
cd /home/cr/code/vide-know/DEV-9
bun install
```

Expected: All dependencies installed, no errors

**Step 7: Commit**

```bash
cd /home/cr/code/vide-know/DEV-9
git add apps/backend/
git commit -m "feat: scaffold backend with Hono and basic health endpoint"
```

---

### Task 2.2: Set up SQLite and Drizzle schema

**Files:**
- Create: `apps/backend/src/db/schema.ts`
- Create: `apps/backend/src/db/client.ts`
- Create: `apps/backend/drizzle.config.ts`
- Create: `apps/backend/migrations/0001_initial.sql`

**Step 1: Create Drizzle schema (src/db/schema.ts)**

```typescript
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).default(
    () => new Date()
  ),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).default(
    () => new Date()
  ),
});
```

Save to `/home/cr/code/vide-know/DEV-9/apps/backend/src/db/schema.ts`

**Step 2: Create Drizzle client (src/db/client.ts)**

```typescript
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "path";
import { fileURLToPath } from "url";
import * as schema from "./schema";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use platform-specific user data directory
const dataDir = getDataDir();
const dbPath = path.join(dataDir, "vide-know.db");

function getDataDir(): string {
  const platform = process.platform;
  const home = process.env.HOME || process.env.USERPROFILE || "";

  switch (platform) {
    case "darwin": // macOS
      return path.join(home, "Library", "Application Support", "vide-know");
    case "win32": // Windows
      return path.join(home, "AppData", "Local", "vide-know");
    default: // Linux
      return path.join(home, ".config", "vide-know");
  }
}

// Ensure data directory exists
import { mkdirSync } from "fs";
mkdirSync(dataDir, { recursive: true });

// Initialize database
const sqlite = new Database(dbPath);
export const db = drizzle(sqlite, { schema });

// Run migrations on startup
export async function initializeDb() {
  console.log(`Initializing database at ${dbPath}`);
  // TODO: Run migration scripts here when migrations are ready
  console.log("Database initialized");
}
```

Save to `/home/cr/code/vide-know/DEV-9/apps/backend/src/db/client.ts`

**Step 3: Create drizzle.config.ts**

```typescript
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./migrations",
  driver: "better-sqlite",
  dbCredentials: {
    url: "./vide-know.db",
  },
} satisfies Config;
```

Save to `/home/cr/code/vide-know/DEV-9/apps/backend/drizzle.config.ts`

**Step 4: Commit**

```bash
cd /home/cr/code/vide-know/DEV-9
git add apps/backend/src/db/ apps/backend/drizzle.config.ts
git commit -m "feat: add SQLite schema and Drizzle client with migrations setup"
```

---

### Task 2.3: Add settings API endpoints

**Files:**
- Modify: `apps/backend/src/index.ts`

**Step 1: Update src/index.ts with settings endpoints**

Replace the entire file with:

```typescript
import { Hono } from "hono";
import { db, initializeDb } from "./db/client";
import { settings } from "./db/schema";
import { eq } from "drizzle-orm";

const app = new Hono();

// Health endpoint
app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// Get all settings
app.get("/api/settings", async (c) => {
  try {
    const allSettings = await db.select().from(settings);
    const result: Record<string, string> = {};
    allSettings.forEach((s) => {
      result[s.key] = s.value;
    });
    return c.json(result);
  } catch (error) {
    console.error("Error fetching settings:", error);
    return c.json({ error: "Failed to fetch settings" }, 500);
  }
});

// Get single setting
app.get("/api/settings/:key", async (c) => {
  const key = c.req.param("key");
  try {
    const result = await db
      .select()
      .from(settings)
      .where(eq(settings.key, key));
    if (result.length === 0) {
      return c.json({ error: "Setting not found" }, 404);
    }
    return c.json({ [key]: result[0].value });
  } catch (error) {
    console.error("Error fetching setting:", error);
    return c.json({ error: "Failed to fetch setting" }, 500);
  }
});

// Update or create setting
app.post("/api/settings/:key", async (c) => {
  const key = c.req.param("key");
  const body = await c.req.json();
  const value = body.value;

  if (!value) {
    return c.json({ error: "Value is required" }, 400);
  }

  try {
    const existing = await db
      .select()
      .from(settings)
      .where(eq(settings.key, key));

    if (existing.length > 0) {
      await db
        .update(settings)
        .set({ value, updatedAt: new Date() })
        .where(eq(settings.key, key));
    } else {
      await db.insert(settings).values({ key, value });
    }

    return c.json({ [key]: value }, 200);
  } catch (error) {
    console.error("Error updating setting:", error);
    return c.json({ error: "Failed to update setting" }, 500);
  }
});

// Initialize database on startup
await initializeDb();

const PORT = process.env.PORT || 3001;

console.log(`Server starting on http://localhost:${PORT}`);

export default {
  port: PORT,
  fetch: app.fetch,
};
```

Save to `/home/cr/code/vide-know/DEV-9/apps/backend/src/index.ts`

**Step 2: Commit**

```bash
cd /home/cr/code/vide-know/DEV-9
git add apps/backend/src/index.ts
git commit -m "feat: add settings CRUD API endpoints with database integration"
```

---

## Phase 3: Frontend Scaffold

### Task 3.1: Initialize Tauri project

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/vite.config.ts`
- Create: `apps/desktop/index.html`

**Step 1: Create frontend package.json**

```json
{
  "name": "@vide-know/desktop",
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "tauri dev",
    "build": "tauri build",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^6.20.0",
    "@tauri-apps/api": "^2.0.0-rc",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "typescript": "^5.3.3",
    "vite": "^5.0.0",
    "tailwindcss": "^4.0.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "@tauri-apps/cli": "^2.0.0-rc"
  }
}
```

Save to `/home/cr/code/vide-know/DEV-9/apps/desktop/package.json`

**Step 2: Create frontend tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*", "src-tauri/**/*"],
  "exclude": ["node_modules", "dist", "target"]
}
```

Save to `/home/cr/code/vide-know/DEV-9/apps/desktop/tsconfig.json`

**Step 3: Create vite.config.ts**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    strictPort: true,
    port: 1420,
  },
});
```

Save to `/home/cr/code/vide-know/DEV-9/apps/desktop/vite.config.ts`

**Step 4: Create index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/src/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vide Know</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Save to `/home/cr/code/vide-know/DEV-9/apps/desktop/index.html`

**Step 5: Create src directory**

```bash
mkdir -p /home/cr/code/vide-know/DEV-9/apps/desktop/src/components
mkdir -p /home/cr/code/vide-know/DEV-9/apps/desktop/src/pages
mkdir -p /home/cr/code/vide-know/DEV-9/apps/desktop/src/lib
```

**Step 6: Create src/main.tsx**

```typescript
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Save to `/home/cr/code/vide-know/DEV-9/apps/desktop/src/main.tsx`

**Step 7: Create src/index.css (Tailwind + base styles)**

```css
@import "tailwindcss";

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
    Ubuntu, Cantarell, sans-serif;
}

#root {
  height: 100%;
}
```

Save to `/home/cr/code/vide-know/DEV-9/apps/desktop/src/index.css`

**Step 8: Create tailwind.config.js**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

Save to `/home/cr/code/vide-know/DEV-9/apps/desktop/tailwind.config.js`

**Step 9: Create postcss.config.js**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

Save to `/home/cr/code/vide-know/DEV-9/apps/desktop/postcss.config.js`

**Step 10: Commit**

```bash
cd /home/cr/code/vide-know/DEV-9
git add apps/desktop/package.json apps/desktop/tsconfig.json apps/desktop/vite.config.ts apps/desktop/index.html apps/desktop/src/ apps/desktop/tailwind.config.js apps/desktop/postcss.config.js
git commit -m "feat: scaffold frontend with React, Vite, Tailwind, and TypeScript"
```

---

### Task 3.2: Create Tauri configuration

**Files:**
- Create: `apps/desktop/src-tauri/tauri.conf.json`
- Create: `apps/desktop/src-tauri/Cargo.toml`

**Step 1: Create src-tauri directory**

```bash
mkdir -p /home/cr/code/vide-know/DEV-9/apps/desktop/src-tauri
```

**Step 2: Create src-tauri/tauri.conf.json**

```json
{
  "productName": "Vide Know",
  "version": "0.0.1",
  "identifier": "com.vide-know.app",
  "build": {
    "beforeDevCommand": "bun run dev --cwd ../.. --filter @vide-know/desktop",
    "beforeBuildCommand": "bun run build --cwd ../.. --filter @vide-know/desktop",
    "devUrl": "http://localhost:1420",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Vide Know",
        "width": 1200,
        "height": 800,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "identifier": "com.vide-know.app",
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"]
  }
}
```

Save to `/home/cr/code/vide-know/DEV-9/apps/desktop/src-tauri/tauri.conf.json`

**Step 3: Create src-tauri/Cargo.toml**

```toml
[package]
name = "vide-know"
version = "0.0.1"
description = "Video knowledge platform"
authors = ["Dev Team"]
edition = "2021"

[lib]
name = "vide_know_lib"
path = "src/lib.rs"

[[bin]]
name = "vide-know"
path = "src/main.rs"

[build-dependencies]
tauri-build = { version = "2.0.0-rc", features = [] }

[dependencies]
tauri = { version = "2.0.0-rc", features = ["shell-open"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]
```

Save to `/home/cr/code/vide-know/DEV-9/apps/desktop/src-tauri/Cargo.toml`

**Step 4: Create src-tauri/src/main.rs**

```rust
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Save to `/home/cr/code/vide-know/DEV-9/apps/desktop/src-tauri/src/main.rs`

**Step 5: Create src-tauri/src/lib.rs**

```rust
pub fn init() {
    // Placeholder
}
```

Save to `/home/cr/code/vide-know/DEV-9/apps/desktop/src-tauri/src/lib.rs`

**Step 6: Create src-tauri/build.rs**

```rust
fn main() {
    tauri_build::build()
}
```

Save to `/home/cr/code/vide-know/DEV-9/apps/desktop/src-tauri/build.rs`

**Step 7: Create icons directory with placeholder**

```bash
mkdir -p /home/cr/code/vide-know/DEV-9/apps/desktop/src-tauri/icons
```

**Step 8: Commit**

```bash
cd /home/cr/code/vide-know/DEV-9
git add apps/desktop/src-tauri/
git commit -m "feat: add Tauri configuration for desktop app"
```

---

### Task 3.3: Build app shell with routing and sidebar

**Files:**
- Create: `apps/desktop/src/App.tsx`
- Create: `apps/desktop/src/components/Sidebar.tsx`
- Create: `apps/desktop/src/components/Layout.tsx`
- Create: `apps/desktop/src/pages/Dashboard.tsx`
- Create: `apps/desktop/src/pages/Settings.tsx`

**Step 1: Create src/App.tsx**

```typescript
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
```

Save to `/home/cr/code/vide-know/DEV-9/apps/desktop/src/App.tsx`

**Step 2: Create src/components/Layout.tsx**

```typescript
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function Layout() {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
```

Save to `/home/cr/code/vide-know/DEV-9/apps/desktop/src/components/Layout.tsx`

**Step 3: Create src/components/Sidebar.tsx**

```typescript
import { Link, useLocation } from "react-router-dom";
import clsx from "clsx";

export default function Sidebar() {
  const location = useLocation();

  const navItems = [
    { label: "Dashboard", path: "/" },
    { label: "Settings", path: "/settings" },
  ];

  return (
    <aside className="w-64 border-r border-border bg-sidebar p-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Vide Know</h1>
      </div>

      <nav className="space-y-2">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={clsx(
              "block px-4 py-2 rounded-lg transition-colors",
              location.pathname === item.path
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent text-foreground"
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
```

Save to `/home/cr/code/vide-know/DEV-9/apps/desktop/src/components/Sidebar.tsx`

**Step 4: Create src/pages/Dashboard.tsx**

```typescript
export default function Dashboard() {
  return (
    <div className="p-8">
      <h2 className="text-3xl font-bold mb-4">Dashboard</h2>
      <p className="text-muted-foreground">
        Welcome to Vide Know. Your video knowledge platform.
      </p>
    </div>
  );
}
```

Save to `/home/cr/code/vide-know/DEV-9/apps/desktop/src/pages/Dashboard.tsx`

**Step 5: Create src/pages/Settings.tsx**

```typescript
import { useState, useEffect } from "react";

interface SettingsData {
  [key: string]: string;
}

export default function Settings() {
  const [settings, setSettings] = useState<SettingsData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const response = await fetch("http://localhost:3001/api/settings");
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      } else {
        setError("Failed to fetch settings");
      }
    } catch (err) {
      setError("Failed to connect to backend");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function updateSetting(key: string, value: string) {
    try {
      const response = await fetch(
        `http://localhost:3001/api/settings/${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value }),
        }
      );
      if (response.ok) {
        const data = await response.json();
        setSettings({ ...settings, ...data });
      } else {
        setError("Failed to update setting");
      }
    } catch (err) {
      setError("Failed to connect to backend");
      console.error(err);
    }
  }

  if (loading) return <div className="p-8">Loading settings...</div>;

  return (
    <div className="p-8">
      <h2 className="text-3xl font-bold mb-6">Settings</h2>

      {error && (
        <div className="bg-destructive/10 border border-destructive text-destructive p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div className="border border-border rounded-lg p-4">
          <label className="block text-sm font-medium mb-2">
            API Base URL
          </label>
          <input
            type="text"
            value={settings["apiBaseUrl"] || ""}
            onChange={(e) =>
              updateSetting("apiBaseUrl", e.target.value)
            }
            className="w-full px-3 py-2 border border-input rounded-lg bg-background"
            placeholder="http://localhost:3001"
          />
        </div>

        <div className="border border-border rounded-lg p-4">
          <label className="block text-sm font-medium mb-2">Theme</label>
          <select
            value={settings["theme"] || "light"}
            onChange={(e) => updateSetting("theme", e.target.value)}
            className="w-full px-3 py-2 border border-input rounded-lg bg-background"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </div>
    </div>
  );
}
```

Save to `/home/cr/code/vide-know/DEV-9/apps/desktop/src/pages/Settings.tsx`

**Step 6: Install frontend dependencies**

```bash
cd /home/cr/code/vide-know/DEV-9
bun install
```

Expected: All dependencies installed, no errors

**Step 7: Commit**

```bash
cd /home/cr/code/vide-know/DEV-9
git add apps/desktop/src/
git commit -m "feat: build app shell with routing, sidebar, dashboard and settings pages"
```

---

## Phase 4: Integration & Validation

### Task 4.1: Test dev workflow and validate all success criteria

**Files:**
- None (validation only)

**Step 1: Start backend server**

```bash
cd /home/cr/code/vide-know/DEV-9
bun run --cwd apps/backend dev &
```

Expected: Server logs show "Server starting on http://localhost:3001"

**Step 2: Verify backend health endpoint**

```bash
curl http://localhost:3001/api/health
```

Expected: Response: `{"status":"ok","timestamp":"2026-03-05T..."}`

**Step 3: Test settings endpoints**

```bash
# Create a setting
curl -X POST http://localhost:3001/api/settings/test-key \
  -H "Content-Type: application/json" \
  -d '{"value":"test-value"}'

# Expected: {"test-key":"test-value"}

# Fetch all settings
curl http://localhost:3001/api/settings

# Expected: {"test-key":"test-value"}

# Fetch single setting
curl http://localhost:3001/api/settings/test-key

# Expected: {"test-key":"test-value"}
```

**Step 4: Verify SQLite database created**

```bash
ls -la ~/.config/vide-know/ || ls -la ~/Library/Application\ Support/vide-know/ || echo "Check platform-specific data dir"
```

Expected: `vide-know.db` file exists

**Step 5: Verify database schema**

```bash
# Check tables exist
sqlite3 ~/.config/vide-know/vide-know.db ".tables"
```

Expected: Output includes "settings"

**Step 6: Stop backend and commit**

```bash
pkill -f "bun run src/index.ts"
cd /home/cr/code/vide-know/DEV-9
git add -A
git commit -m "test: validate backend health, settings API, and database initialization"
```

---

### Task 4.2: Final validation checklist

**Acceptance Criteria:**

- [ ] `bun dev` starts both Tauri window and Bun backend
- [ ] Frontend renders app shell with sidebar navigation
- [ ] Backend responds to `GET /api/health`
- [ ] SQLite database is created with all tables on first run
- [ ] Settings can be read/written via API

**Validation Steps:**

1. Run `cd /home/cr/code/vide-know/DEV-9 && bun dev`
2. Verify Tauri window opens (desktop app)
3. Verify sidebar appears with Dashboard and Settings links
4. Navigate to Settings page
5. Verify settings form loads and can update values
6. Check network tab: backend responds with settings data
7. Stop dev server and check database: `vide-know.db` exists with data
8. Restart and verify persistence

All criteria verified → Move to Human Review

---

## Execution Notes

- Each task 2-5 minutes, bite-sized
- Frequent commits for clarity
- Validate after Phase 3 scaffold before integration
- Use `bun run` for workspace commands
- Database auto-initializes on backend startup
- Frontend proxies to localhost:3001 for API calls
