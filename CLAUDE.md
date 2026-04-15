# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Initial setup (install deps + generate Prisma client + run migrations)
npm run setup

# Development server (with Turbopack)
npm run dev

# Build for production
npm run build

# Run all tests
npm test

# Run a single test file
npx vitest run src/lib/__tests__/file-system.test.ts

# Lint
npm run lint

# Reset database (destructive)
npm run db:reset

# Re-generate Prisma client after schema changes
npx prisma generate

# Run new migrations after schema changes
npx prisma migrate dev
```

## Environment

Copy `.env` and set `ANTHROPIC_API_KEY`. Without it, the app runs with a `MockLanguageModel` that returns static components — useful for development without burning API credits.

The Prisma SQLite database lives at `prisma/dev.db`. The generated Prisma client outputs to `src/generated/prisma` (not the usual `node_modules` location).

## Architecture

This is a **Next.js 15 App Router** app where users describe React components in a chat, Claude generates them via tool calls, and they render live in a sandboxed iframe.

### Request flow

1. **User types a message** → `ChatInterface` sends `POST /api/chat` with `{ messages, files, projectId? }`
2. **`/api/chat/route.ts`** reconstructs a `VirtualFileSystem` from the serialized `files` payload, then calls `streamText` (Vercel AI SDK) with two tools: `str_replace_editor` and `file_manager`
3. **Claude streams tool calls** (create/edit files) back to the client
4. **`ChatContext`** receives tool call events and calls `handleToolCall` from `FileSystemContext`, which mutates the in-memory `VirtualFileSystem`
5. **`PreviewFrame`** watches `refreshTrigger` from `FileSystemContext`, runs `createImportMap` on the VFS contents, and sets `iframe.srcdoc` with the generated HTML

### Virtual file system

`src/lib/file-system.ts` — `VirtualFileSystem` is an in-memory tree (root `FileNode` with `Map<string, FileNode>` children). It is **never written to disk**. Serialization to/from plain objects happens when saving to the DB (`serialize()`) or loading a project (`deserializeFromNodes()`).

The VFS exposes editing primitives used by the AI tools: `createFileWithParents`, `replaceInFile`, `insertInFile`. These mirror the `str_replace_editor` tool interface Claude uses.

### Preview rendering pipeline

`src/lib/transform/jsx-transformer.ts`:
- `transformJSX` — transpiles JSX/TSX with `@babel/standalone` (runs in the browser)
- `createImportMap` — builds a browser [Import Map](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap): local files become blob URLs; unknown npm packages resolve to `https://esm.sh/<pkg>`; the `@/` alias maps to `/` (root of VFS)
- `createPreviewHTML` — wraps everything in an HTML document with Tailwind CDN, the import map, and a module script that mounts the React app

The preview iframe uses `allow-scripts allow-same-origin allow-forms` sandbox. All React code runs at React 19 from `esm.sh`.

### AI tools

Two tools are registered in `route.ts`:
- **`str_replace_editor`**: `create`, `str_replace`, `insert` commands — Claude's primary editing interface
- **`file_manager`**: `rename`, `delete` commands

Tool handling is split: the server-side tools in `src/lib/tools/` update the server-side VFS instance (used for final DB save); the client-side `handleToolCall` in `FileSystemContext` mirrors the mutations on the client VFS to trigger live preview updates.

### Auth & projects

JWT-based sessions (`jose` library) stored in `auth-token` httpOnly cookie, 7-day expiry. `src/lib/auth.ts` handles session creation/verification. `src/middleware.ts` protects `/api/projects` and `/api/filesystem` routes.

Anonymous users can use the app — their work is not persisted. Authenticated users get a project per session; chat history and VFS state are saved to the `Project` model (messages as JSON string, VFS as JSON string in `data` column).

### Contexts

- **`FileSystemContext`** (`src/lib/contexts/file-system-context.tsx`) — holds the client VFS instance, triggers preview refreshes via an incrementing `refreshTrigger` counter
- **`ChatContext`** (`src/lib/contexts/chat-context.tsx`) — manages message history and the `useChat` hook from Vercel AI SDK; routes tool call events to `FileSystemContext.handleToolCall`

### AI model configuration

`src/lib/provider.ts` — returns `anthropic("claude-haiku-4-5")` if `ANTHROPIC_API_KEY` is set, otherwise `MockLanguageModel`. The system prompt in `src/lib/prompts/generation.tsx` instructs Claude to always create `/App.jsx` as the entry point, use `@/` imports for local files, and style with Tailwind.

### Testing

Tests use Vitest + jsdom + React Testing Library. Test files live in `__tests__/` subdirectories next to the code they test. Path aliases (`@/`) work via `vite-tsconfig-paths`.
