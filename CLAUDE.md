# CLAUDE.md — AI Agent Instructions for Ally

This file provides context for AI agents (Claude Code, Cursor, Codex, etc.) working on this codebase.

## Project Overview

Ally is a personal AI companion mobile app. This monorepo contains the Expo/React Native frontend and the Elysia/Bun TypeScript backend.

## Tech Stack

- **Runtime:** Bun (not Node.js) — use `bun` for all commands, not `npm`/`yarn`/`npx`
- **Monorepo:** Turborepo with Bun workspaces
- **Backend:** Elysia (Bun-native web framework), TypeScript
- **Database:** PostgreSQL + pgvector via Drizzle ORM (hosted on Neon)
- **AI:** Claude claude-sonnet-4-6 via `@anthropic-ai/sdk` (TypeScript, NOT Python)
- **Embeddings:** Voyage AI `voyage-4-lite` (1024 dimensions)
- **Frontend:** Expo 55, React Native 0.83, NativeWind, Zustand, expo-router
- **Validation:** TypeBox (Elysia built-in) for routes, Zod in `packages/shared` for shared schemas

## Repository Structure

```
apps/api/          → Elysia backend (all TypeScript)
apps/mobile/       → Expo React Native frontend
packages/shared/   → Shared types, schemas, constants
packages/tsconfig/ → Shared TypeScript configurations
docs/              → Architecture and product documentation
_legacy/           → Old Node/Express + Python code (DO NOT modify or reference)
```

## Critical Rules

### Never Do

- Do NOT use `npm`, `yarn`, or `npx`. Always use `bun` and `bunx`.
- Do NOT add Python code. The entire backend is TypeScript.
- Do NOT modify anything in `_legacy/`. It exists only as reference.
- Do NOT add Express.js patterns. The backend uses Elysia, which has its own conventions.
- Do NOT use `require()` or CommonJS. Everything is ESM (`import`/`export`).
- Do NOT add comments that merely narrate what code does. Only comment non-obvious intent.
- Do NOT introduce new dependencies without a strong reason. Check if Bun/Elysia builtins cover it.
- Do NOT hardcode API keys, secrets, or connection strings. Use environment variables.
- Do NOT use `any` type unless absolutely necessary (interfacing with untyped libs). Prefer `unknown` and narrow.

### Always Do

- Run `tsc --noEmit` in `apps/api/` before considering backend work complete.
- Use types from `@ally/shared` for any type that's used across packages.
- Use Drizzle ORM for all database operations. Never write raw SQL unless it involves pgvector operations not supported by the ORM.
- Use the Anthropic TypeScript SDK for all AI calls. Prompts live in `apps/api/src/ai/prompts.ts`.
- Keep route handlers thin — business logic belongs in `services/` or `ai/`.
- Use `workspace:*` for internal package dependencies.

## Key Architecture Decisions

### Memory System (Most Important)

Ally's memory uses a **tiered architecture**:
1. **Hot memory** — JSONB profile in `memory_profiles` table. Always loaded for every AI call.
2. **Warm memory** — Recent conversation messages. Loaded per conversation.
3. **Cold memory** — `memory_facts` table with pgvector embeddings. Retrieved via **hybrid search** combining semantic similarity, full-text matching, recency decay, and importance scoring. See `apps/api/src/services/retrieval.ts`.

### Hybrid Retrieval Weights

The retrieval query in `retrieval.ts` uses these weights:
- Semantic similarity (cosine distance): 40%
- Full-text match (tsvector): 20%
- Recency (exponential decay): 25%
- Importance score: 15%

Do not change these weights without understanding the impact on retrieval quality.

### Middleware Stack

All requests pass through these middleware layers (in order):
1. **CORS** — `@elysiajs/cors`, configured in `index.ts`. Allows all origins, exposes rate-limit headers.
2. **Logger** — `middleware/logger.ts`. Logs `METHOD /path STATUS duration` for every request. Errors logged separately.
3. **Auth** — `middleware/auth.ts`. JWT verification via `jose`. Adds `user` to context.
4. **Rate Limiting** — `middleware/rateLimit.ts`. Per-user, two-tier: per-minute burst protection + daily message quotas from `TIER_LIMITS`. Exposes `X-RateLimit-*` headers.
5. **Tier Check** — `middleware/tierCheck.ts`. Gates premium features by user tier.

### AI Service Layer

All 5 AI functions live in `apps/api/src/ai/`:
- `conversation.ts` — Chat responses with memory context (supports both sync and SSE streaming)
- `onboarding.ts` — Process onboarding answers into memory profile
- `extraction.ts` — Extract facts from conversations (nightly job)
- `briefing.ts` — Generate morning briefings
- `followup.ts` — Detect unresolved emotional moments

All use `claude-sonnet-4-6` via the shared client in `client.ts`. Prompts are centralized in `prompts.ts`.

The AI client (`client.ts`) includes:
- `AIError` class with status codes and retryable flags
- `callClaudeStreaming()` for SSE-based streaming responses
- `isClaudeReachable()` for health checks

### Error Handling

- External AI/embedding calls wrap errors in `AIError` with proper HTTP status codes (503, 429).
- Embedding service (`services/embedding.ts`) retries up to 2 times with exponential backoff.
- The global error handler in `index.ts` maps error codes: 429 → `RATE_LIMIT_EXCEEDED`, 503 → `AI_UNAVAILABLE`.
- Chat streaming sends `{ type: "error", message }` SSE events instead of crashing the stream.

### Background Jobs

In `apps/api/src/jobs/`. Scheduled via a persistent, interval-based scheduler. Job runs are tracked in the `job_runs` table to prevent duplicate runs across restarts. Runs:
- Nightly extraction at 23:00
- Daily briefings at 05:00
- Weekly insights on Sunday at 20:00
- Re-engagement at 18:00

## Common Tasks

### Add a new API route
1. Create route file in `apps/api/src/routes/`
2. Use `new Elysia({ prefix: "/api/v1" })` pattern
3. Add auth via `.use(authMiddleware)` if needed
4. Add rate limiting via `.use(rateLimitMiddleware)` if the route accepts user input
5. Add tier gating via `.use(requireTier(...))` if needed
6. Register in `apps/api/src/index.ts`

### Add a new shared type
1. Add to the appropriate file in `packages/shared/src/types/`
2. Export from `packages/shared/src/types/index.ts`

### Add a new database table
1. Add schema in `apps/api/src/db/schema.ts`
2. Run `bun run db:generate` then `bun run db:migrate` in `apps/api/`

### Modify memory extraction
1. Update extraction prompt in `apps/api/src/ai/prompts.ts`
2. Update `ExtractedFact` type in `packages/shared/src/types/memory.ts` if schema changes
3. Update `apps/api/src/ai/extraction.ts` for processing logic
4. Update `apps/api/src/services/memory.ts` for storage logic

## Testing

Uses `bun:test` (Bun's built-in test runner). Tests live in `apps/api/src/__tests__/`.

### Three Test Tiers

| Tier | Directory | What it tests | Mocking | Speed | When to run |
|------|-----------|---------------|---------|-------|-------------|
| **Unit** | `__tests__/unit/` | Middleware, AI layer, services in isolation | AI + embeddings mocked | Fast (~2s) | Always — every change |
| **Integration** | `__tests__/integration/` | Full request → middleware → handler → DB → response | AI + embeddings mocked, real DB | Medium (~15s) | Always — every change |
| **E2E** | `__tests__/e2e/` | Real Claude, real Voyage AI, real pgvector retrieval | Nothing mocked | Slow (~60s), costs money | On-demand — before releases, after prompt changes, when validating AI quality |

### Running Tests

```bash
cd apps/api
bun run test               # Unit + integration (30s timeout)
bun run test:unit          # Unit tests only (fast, no DB)
bun run test:integration   # Integration tests (requires .env.test)
bun run test:coverage      # With coverage report

# E2E tests — requires .env.test.live with real API keys
bun run test:e2e                # All E2E tests (60s timeout)
bun run test:e2e:embeddings     # Embedding quality only
bun run test:e2e:retrieval      # Retrieval ranking only
```

### Test Architecture

- **Unit tests** — Test middleware, AI layer, services in isolation. AI and embedding services are always mocked via the preload in `__tests__/setup.ts`.
- **Integration tests** — Test full request → middleware → handler → DB → response cycle using `app.handle(request)`. Uses a real Neon test branch database. AI/embeddings still mocked.
- **E2E tests** — Hit real Claude and Voyage AI APIs. Use a separate preload (`__tests__/setup.e2e.ts`) that loads `.env.test.live` and does NOT mock anything. Test files:
  - `embedding-quality.test.ts` — Voyage API quality, cosine similarity assertions
  - `retrieval-ranking.test.ts` — Hybrid retrieval with real vectors in pgvector
  - `chat-live.test.ts` — Full chat pipeline including SSE streaming
  - `onboarding-live.test.ts` — Structured output parsing from real Claude
  - `extraction-pipeline.test.ts` — Memory extraction + embedding + storage + retrieval
  - `memory-lifecycle.test.ts` — Golden path: onboard → chat → extract → retrieve → chat with context
  - `prompt-regression.test.ts` — Fixture-based prompt quality assertions (catches regressions in `prompts.ts`)

### Mocking (Unit + Integration)

The global preload (`__tests__/setup.ts`) automatically mocks:
- `ai/client.ts` — `callClaude`, `callClaudeStreaming`, `callClaudeStructured` return canned responses
- `services/embedding.ts` — `generateEmbedding` returns zero vectors (1024 dims)

**Never** call real Claude or Voyage AI in unit/integration tests. If you need different mock responses, use `mock.module()` within the specific test file.

### E2E Test Setup

E2E tests require a `.env.test.live` file with real API keys:
```bash
cp apps/api/.env.test.live.example apps/api/.env.test.live
# Fill in real ANTHROPIC_API_KEY and VOYAGE_API_KEY
```

E2E tests use a separate Bun config (`bunfig.e2e.toml`) that preloads `setup.e2e.ts` instead of `setup.ts`. This means imports go to the real modules, not mocks.

### Writing New Tests

1. Place unit tests in `__tests__/unit/<layer>/` matching the source structure
2. Place integration tests in `__tests__/integration/routes/` or `__tests__/integration/jobs/`
3. Place E2E tests in `__tests__/e2e/` — each file should be self-contained (seed own data, clean up after)
4. Use helpers from `__tests__/helpers/`: `signTestToken()` for auth, `seedUsers()`/`seedConversation()` for DB data, `createTestApp()` for route tests
5. E2E helpers live in `__tests__/e2e/helpers.ts`: `e2eCleanup()`, `e2eSeedUser()`, `buildE2EProfile()`, `cosineSimilarity()`
6. Always call `truncateAll()` in `beforeEach` for integration tests to ensure isolation
7. Run `bun run test` before considering backend work complete

### Manual Testing

See `docs/MANUAL_TESTING.md` for Postman setup, curl cheatsheets, and SSE streaming debugging. A Postman collection is available at `docs/postman/`.

## Environment Variables

Required for `apps/api/`:
- `DATABASE_URL` — Neon PostgreSQL connection string
- `ANTHROPIC_API_KEY` — Claude API key
- `VOYAGE_API_KEY` — Voyage AI embedding API key
- `JWT_SECRET` — Shared secret for JWT verification
- `WEBHOOK_SECRET` — Secret for subscription webhook verification
- `PORT` — Server port (default 3000)
- `NODE_ENV` — development / production
