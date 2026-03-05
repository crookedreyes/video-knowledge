# DEV-9 Design: Project Foundation & Scaffolding

**Date:** 2026-03-05
**Ticket:** DEV-9
**Status:** Design Approved

## Overview

Scaffold a Bun + Tauri monorepo with full tooling, database, and application shell. This is the foundation for all future work.

## Architecture

### Monorepo Structure

```
.
├── apps/
│   ├── desktop/
│   │   ├── src/
│   │   │   ├── components/     (React components)
│   │   │   ├── pages/          (Route pages)
│   │   │   ├── App.tsx         (Router setup)
│   │   │   └── main.tsx        (Tauri entry)
│   │   ├── src-tauri/          (Tauri config, binaries)
│   │   └── package.json
│   └── backend/
│       ├── src/
│       │   ├── routes/         (Hono route handlers)
│       │   ├── db/             (Drizzle schema, migrations)
│       │   └── index.ts        (Server entry)
│       └── package.json
├── packages/
│   └── shared/
│       ├── src/
│       │   └── types.ts        (Shared types)
│       └── package.json
├── bun.workspaces.json
├── biome.json
└── tsconfig.json
```

### Workspace Configuration

**bun.workspaces.json:**
- Root lists `apps/desktop`, `apps/backend`, `packages/shared`
- Single `bun install` installs all dependencies
- Root `bun dev` script uses `concurrently` to start Tauri + backend

### Technology Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Package Manager | Bun | Fast, modern, built-in bundling |
| Desktop Framework | Tauri v2 | Native, lightweight, small bundle |
| Frontend | React 19 + Vite | Latest React, HMR for dev, small bundle |
| Styling | Tailwind v4 + shadcn/ui | Utility-first, pre-built accessible components |
| Backend | Bun + Hono | Minimal overhead, type-safe routing |
| Database | SQLite + Drizzle | Embedded, type-safe migrations, good DX |
| Process Coordination | (bash/bun run script) | Simple, reproducible |

## Key Features

### Dev Workflow (`bun dev`)

1. Root `bun dev` orchestrates two processes:
   - Tauri dev server (opens window, watches Tauri config)
   - Bun backend server (auto-reload on file changes)
2. Both start in parallel; Tauri window points to local backend URL
3. Frontend HMR enabled via Vite in Tauri
4. Backend auto-reload via `--hot` flag (or similar)

### Backend API

**Health Endpoint:**
- `GET /api/health` → `{ status: "ok", timestamp: ISO8601 }`

**Settings Endpoints:**
- `GET /api/settings` → Returns current settings from DB
- `POST /api/settings` → Updates settings in DB

**Database (SQLite):**
- Tables: `settings` (key-value store)
- Location: User data directory (platform-aware: `~/.vide-know/` or Windows equivalent)
- Migrations: Run on first startup if DB doesn't exist

### Frontend Shell

**Router Structure:**
- `/` → Dashboard (placeholder)
- `/settings` → Settings page

**Sidebar Navigation:**
- Logo/branding
- Navigation links
- Settings link
- (Future: user menu)

**Styling:**
- Tailwind v4 for utilities
- shadcn/ui Button, Card, Input, etc. components
- Dark mode support via Tailwind

### Database Schema

**Settings Table:**
```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

Drizzle schema definition handles type safety and migrations.

## Implementation Order

1. **Monorepo bootstrap** (workspace config, root package.json)
2. **Backend scaffold** (Bun + Hono, health endpoint, SQLite schema)
3. **Frontend scaffold** (Tauri, React 19, Vite setup, basic routing)
4. **Database setup** (Drizzle schema, migrations, API integration)
5. **App shell UI** (Sidebar, routing, settings page)
6. **Dev script coordination** (bun dev script, concurrent processes)
7. **Validation** (all success criteria pass)

## Success Criteria

- [x] `bun dev` starts both Tauri window and Bun backend
- [x] Frontend renders app shell with sidebar navigation
- [x] Backend responds to `GET /api/health`
- [x] SQLite database is created with all tables on first run
- [x] Settings can be read/written via API

## Notes

- Sidecar backend configured in `src-tauri/tauri.conf.json` for production packaging
- Dev mode: direct Bun execution; prod: sidecar binary
- No database file committed; created at runtime in user data dir
- All types shared via `packages/shared`
