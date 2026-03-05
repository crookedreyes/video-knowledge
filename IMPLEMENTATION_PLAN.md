# Tauri v2 App Scaffold Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a fully functional Tauri v2 desktop app in `apps/desktop` with React 19, Vite 6, Tailwind v4, and shadcn/ui configured with hot reload working for both frontend and Rust code.

**Architecture:**
- Monorepo structure with `apps/desktop` as the Tauri app directory
- Rust backend via `src-tauri/` with Cargo workspace integration
- React + Vite frontend in `src/` with HMR
- Tailwind v4 for styling with shadcn/ui component library
- Configured plugins for shell, fs, notification, and process operations

**Tech Stack:** Tauri v2, React 19, Vite 6, Tailwind CSS v4, TypeScript 5, shadcn/ui, lucide-react

---

## Task 1: Initialize Directory Structure and Package Config

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/.gitignore`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/vite.config.ts`

**Step 1: Create package.json**

```json
{
  "name": "desktop",
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "tauri dev",
    "build": "tauri build",
    "test": "vitest"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/plugin-shell": "^2.0.0",
    "tailwindcss": "^4.0.0",
    "lucide-react": "latest",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "@tauri-apps/cli": "^2.0.0"
  }
}
```

**Step 2: Create .gitignore**

```text
# Tauri
src-tauri/target/
src-tauri/Cargo.lock

# Node
node_modules/
dist/
.env
.env.local

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Vite
.vite/
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "esModuleInterop": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**Step 4: Create vite.config.ts**

```typescript
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  clearScreen: false,
  server: {
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: ['es2021', 'chrome100', 'safari13'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
}))
```

**Step 5: Commit**

```bash
cd /home/cr/code/vide-know/DEV-11
git add apps/desktop/package.json apps/desktop/.gitignore apps/desktop/tsconfig.json apps/desktop/vite.config.ts
git commit -m "feat: initialize Tauri app directory structure and config"
```

---

## Task 2: Create Rust Backend Structure

**Files:**
- Create: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/src/lib.rs`
- Create: `apps/desktop/src-tauri/src/main.rs`

**Step 1: Create Cargo.toml**

```toml
[package]
name = "desktop"
version = "0.0.1"
description = "Tauri v2 desktop app"
edition = "2021"

[lib]
name = "desktop_lib"
path = "src/lib.rs"

[[bin]]
name = "desktop"
path = "src/main.rs"

[dependencies]
tauri = { version = "2", features = ["shell-open", "fs-read-file", "fs-write-file"] }
tauri-plugin-shell = "2"
tauri-plugin-fs = "2"
tauri-plugin-notification = "2"
tauri-plugin-process = "2"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
```

**Step 2: Create src/lib.rs**

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 3: Create src/main.rs**

```rust
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    desktop_lib::run();
}
```

**Step 4: Create capabilities/default.json**

```json
{
  "version": 1,
  "identifier": "default",
  "description": "Capability for all Tauri core plugins",
  "local": true,
  "windows": ["main"],
  "webviews": ["main"],
  "permissions": [
    "core:window:allow-create",
    "core:window:allow-center",
    "shell:allow-execute",
    "shell:allow-kill",
    "fs:allow-read-file",
    "fs:allow-write-file",
    "notification:allow-send-notification",
    "process:allow-exit"
  ]
}
```

**Step 5: Commit**

```bash
cd /home/cr/code/vide-know/DEV-11
git add apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/src/ apps/desktop/src-tauri/capabilities/
git commit -m "feat: create Tauri backend with plugins and capabilities"
```

---

## Task 3: Create Tauri Configuration

**Files:**
- Create: `apps/desktop/src-tauri/tauri.conf.json`

**Step 1: Create tauri.conf.json**

```json
{
  "productName": "Desktop",
  "version": "0.0.1",
  "identifier": "com.devtestdan.desktop",
  "build": {
    "beforeDevCommand": "bun run dev",
    "beforeBuildCommand": "bun run build",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Desktop",
        "width": 1024,
        "height": 768,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": "default-src 'self'; img-src 'self' https:; script-src 'self' 'unsafe-inline' 'unsafe-eval';"
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "identifier": "com.devtestdan.desktop",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

**Step 2: Commit**

```bash
cd /home/cr/code/vide-know/DEV-11
git add apps/desktop/src-tauri/tauri.conf.json
git commit -m "feat: configure Tauri with window settings and build commands"
```

---

## Task 4: Create React Frontend Scaffold

**Files:**
- Create: `apps/desktop/src/main.tsx`
- Create: `apps/desktop/src/App.tsx`
- Create: `apps/desktop/src/index.css`
- Create: `apps/desktop/index.html`

**Step 1: Create index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Desktop</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 2: Create src/main.tsx**

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

**Step 3: Create src/App.tsx**

```typescript
import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import './App.css'

export default function App() {
  const [greetMsg, setGreetMsg] = useState('')
  const [name, setName] = useState('')

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMsg(await invoke('greet', { name }))
  }

  return (
    <main className="container">
      <h1>Welcome to Tauri + React</h1>

      <div className="row">
        <input
          id="greet-input"
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Enter a name..."
        />
        <button onClick={() => greet()}>Greet</button>
      </div>
      <p>{greetMsg}</p>
    </main>
  )
}
```

**Step 4: Create src/index.css**

```css
:root {
  color-scheme: light dark;
  color: rgba(255, 255, 255, 0.87);
  background-color: #242424;
}

@media (prefers-color-scheme: light) {
  :root {
    color: #213547;
    background-color: #ffffff;
  }
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.container {
  margin: 0;
  padding: 2rem;
  text-align: center;
}

.row {
  display: flex;
  margin: 1rem 0;
}

input {
  all: unset;
  color: inherit;
  border: 1px solid inherit;
  padding: 0.5rem;
  margin-right: 0.5rem;
}

button {
  all: unset;
  cursor: pointer;
  color: inherit;
  border: 1px solid inherit;
  padding: 0.5rem 1rem;
  background-color: rgba(255, 255, 255, 0.1);
}

button:hover {
  background-color: rgba(255, 255, 255, 0.2);
}

button:active {
  background-color: rgba(255, 255, 255, 0.3);
}
```

**Step 5: Commit**

```bash
cd /home/cr/code/vide-know/DEV-11
git add apps/desktop/src/ apps/desktop/index.html
git commit -m "feat: create React frontend scaffold with basic App component"
```

---

## Task 5: Configure Tailwind CSS v4

**Files:**
- Create: `apps/desktop/src/globals.css`
- Modify: `apps/desktop/package.json` (add tailwindcss scripts)
- Create: `apps/desktop/tailwind.config.ts`
- Create: `apps/desktop/postcss.config.js`

**Step 1: Create tailwind.config.ts**

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

export default config
```

**Step 2: Create postcss.config.js**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

**Step 3: Create src/globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply antialiased;
  }
}
```

**Step 4: Update package.json scripts**

Add to the scripts section:
```json
"scripts": {
  "dev": "tauri dev",
  "build": "tauri build",
  "test": "vitest",
  "tailwind": "tailwindcss -i ./src/globals.css -o ./src/globals.css --watch"
}
```

**Step 5: Update vite.config.ts to import globals**

Add at the top of your vite.config.ts:
```typescript
import './src/globals.css'
```

**Step 6: Commit**

```bash
cd /home/cr/code/vide-know/DEV-11
git add apps/desktop/tailwind.config.ts apps/desktop/postcss.config.js apps/desktop/src/globals.css apps/desktop/package.json
git commit -m "feat: configure Tailwind CSS v4 with PostCSS and globals"
```

---

## Task 6: Initialize shadcn/ui

**Files:**
- Create: `apps/desktop/components.json`
- Create: `apps/desktop/src/components/ui/button.tsx`
- Create: `apps/desktop/src/components/ui/card.tsx`

**Step 1: Create components.json**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "aliasPrefix": "@",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

**Step 2: Create src/lib/utils.ts**

```typescript
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

**Step 3: Create src/components/ui/button.tsx**

```typescript
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
)
Button.displayName = 'Button'

export { Button, buttonVariants }
```

**Step 4: Create src/components/ui/card.tsx**

```typescript
import * as React from 'react'
import { cn } from '@/lib/utils'

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'rounded-lg border border-slate-200 bg-white text-slate-950 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50',
      className
    )}
    {...props}
  />
))
Card.displayName = 'Card'

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 p-6', className)}
    {...props}
  />
))
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn(
      'text-2xl font-semibold leading-none tracking-tight',
      className
    )}
    {...props}
  />
))
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-slate-500 dark:text-slate-400', className)}
    {...props}
  />
))
CardDescription.displayName = 'CardDescription'

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
))
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center p-6 pt-0', className)}
    {...props}
  />
))
CardFooter.displayName = 'CardFooter'

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
}
```

**Step 5: Update src/App.tsx to use shadcn components**

```typescript
import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import './App.css'

export default function App() {
  const [greetMsg, setGreetMsg] = useState('')
  const [name, setName] = useState('')

  async function greet() {
    setGreetMsg(await invoke('greet', { name }))
  }

  return (
    <main className="flex items-center justify-center min-h-screen bg-slate-950">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome to Tauri + React</CardTitle>
          <CardDescription>Desktop app with Tailwind and shadcn/ui</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <input
              id="greet-input"
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder="Enter a name..."
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-slate-950"
            />
          </div>
          <Button onClick={() => greet()} className="w-full">
            Greet
          </Button>
          {greetMsg && <p className="text-center text-slate-600">{greetMsg}</p>}
        </CardContent>
      </Card>
    </main>
  )
}
```

**Step 6: Commit**

```bash
cd /home/cr/code/vide-know/DEV-11
git add apps/desktop/components.json apps/desktop/src/components/ apps/desktop/src/lib/ apps/desktop/src/App.tsx
git commit -m "feat: initialize shadcn/ui with Button and Card components"
```

---

## Task 7: Add Tauri Command Handler

**Files:**
- Modify: `apps/desktop/src-tauri/src/lib.rs`

**Step 1: Update lib.rs with greet command**

```rust
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to Tauri.", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet])
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 2: Commit**

```bash
cd /home/cr/code/vide-know/DEV-11
git add apps/desktop/src-tauri/src/lib.rs
git commit -m "feat: add greet command handler to Tauri backend"
```

---

## Task 8: Install Dependencies and Test Build

**Step 1: Install npm dependencies**

```bash
cd /home/cr/code/vide-know/DEV-11/apps/desktop
bun install
```

Expected output: `packages in X ms`

**Step 2: Verify Rust dependencies compile**

```bash
cd /home/cr/code/vide-know/DEV-11/apps/desktop/src-tauri
cargo check
```

Expected output: `Finished` with no errors

**Step 3: Test development build**

```bash
cd /home/cr/code/vide-know/DEV-11/apps/desktop
bun run tauri dev
```

Expected behavior:
- Tauri should compile Rust backend
- Vite dev server should start
- Desktop window should open with the React app
- Input field and button should be visible
- Typing and clicking "Greet" button should work

**Step 4: Test hot reload**

- Modify `src/App.tsx` welcome text
- Save file - React should hot reload
- Modify `src-tauri/src/lib.rs` greet message
- Save file - Rust should recompile (watch for console output)

**Step 5: Commit test verification**

```bash
cd /home/cr/code/vide-know/DEV-11
git commit -m "test: verify development build and hot reload functionality" --allow-empty
```

---

## Acceptance Criteria Checklist

- [ ] ✓ `src-tauri/` with Cargo.toml, tauri.conf.json, capabilities/default.json
- [ ] ✓ `src-tauri/src/main.rs` and `lib.rs` with minimal Tauri setup
- [ ] ✓ Tauri plugins configured: shell, fs, notification, process
- [ ] ✓ React 19 + Vite 6 frontend scaffold in `src/`
- [ ] ✓ Tailwind v4 configured with `globals.css`
- [ ] ✓ shadcn/ui initialized with `components.json` + Button/Card components
- [ ] ✓ `bun tauri dev` opens a desktop window rendering the React app
- [ ] ✓ Hot reload works for both React and Rust changes

---

## Notes

- All dependencies match the specified versions in the ticket
- Structure follows Tauri conventions with src-tauri for Rust and src for frontend
- shadcn/ui components are created manually to avoid CLI dependencies
- Tailwind v4 configured with PostCSS for production builds
- Hot reload is automatic via Tauri dev and Vite HMR
