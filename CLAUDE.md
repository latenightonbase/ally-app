# CLAUDE.md — AI Agent Instructions for Ally

This file provides context for AI agents (Claude Code, Cursor, Codex, etc.) working on this codebase.

## Project Overview

Ally is a personal AI companion mobile app. This monorepo contains the Expo/React Native frontend and the Elysia/Bun TypeScript backend.

## Tech Stack

- **Runtime:** Bun (not Node.js) — use `bun` for all commands, not `npm`/`yarn`/`npx`
- **Monorepo:** Turborepo with Bun workspaces
- **Backend:** Elysia (Bun-native web framework), TypeScript
- **Database:** Neon PostgreSQL via Drizzle ORM (relational source of truth) + Qdrant Cloud (vector store) + FalkorDB Cloud (entity graph + BullMQ queue backend)
- **AI:** Claude Haiku 4.5 (fast) + Sonnet 4.6 (quality) via `@anthropic-ai/sdk` (TypeScript, NOT Python), with server-side web search tool
- **Embeddings:** Voyage AI `voyage-4-lite` (1024 dimensions) with contextual prefixes
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
- Use Drizzle ORM for all database operations. Never write raw SQL. Vector operations go through the Qdrant client; graph operations go through the FalkorDB client.
- Use the Anthropic TypeScript SDK for all AI calls. Prompts live in `apps/api/src/ai/prompts.ts`.
- Keep route handlers thin — business logic belongs in `services/` or `ai/`.
- Use `workspace:*` for internal package dependencies.

## Key Architecture Decisions

### Memory System (Most Important)

Ally's memory uses a **multi-tier architecture**. See `docs/MEMORY_ARCHITECTURE.md` for the full living doc.

Infrastructure:
- **Neon Postgres** — relational source of truth (users, conversations, fact metadata, events)
- **Qdrant Cloud** — vector store for `memory_facts` and `memory_episodes` (dense cosine search)
- **FalkorDB Cloud** — entity relationship graph (Cypher) + BullMQ queue backend (Redis protocol)

Memory tiers:
1. **Hot** — JSONB profile in `memory_profiles`. Always loaded into every Claude system prompt.
2. **Warm** — Session summaries in `sessions_v2`. Last 5 summaries loaded per conversation.
3. **Upcoming events** — `memory_events` rows in next 7 days injected into every context build.
4. **Semantic (cold)** — `memory_facts`: durable patterns. Stored in Postgres + Qdrant. Retrieved via vector search + reranking.
5. **Episodic** — `memory_episodes`: short-lived events (7–30 days TTL). Same retrieval as facts.
6. **Entity graph** — FalkorDB: entity nodes linked to fact/episode IDs. Used for entity-triggered retrieval at chat time.

**Memory type classification** happens at extraction: Claude classifies every fact as `semantic | episodic | event`. Each routes to the appropriate store in `services/memory.ts`.

**Memory capture** is real-time via BullMQ workers (queue backed by FalkorDB Redis endpoint). The queue batches message pairs, filters trivial messages, and runs extraction with retry logic.

**Consolidation** runs weekly (Sunday 3am): clusters related episodes → Claude reflection → new semantic facts. Based on Generative Agents (Park et al., 2023) pattern.

**Maintenance** runs daily (2am): promotes past events to episodes, purges expired unconsolidated episodes, applies importance decay monthly.

### Session Windowing

Conversations are silently split into sessions (30min inactivity gap = new session). When a session ends, it's summarized by Claude and the summary is stored in the `sessions_v2` table. Context for AI calls is assembled from: recent session summaries (last 5) + full messages from the active session. The user sees a single continuous conversation.

### Hybrid Retrieval

`retrieval.ts` uses a **three-stage approach**, merged via Reciprocal Rank Fusion (RRF):

**Stage 1: Qdrant dense vector search**
- Query is embedded with `addContextualPrefix()` (voyage-4-lite, 1024 dims)
- Qdrant returns top-20 candidates by cosine similarity

**Stage 2: Qdrant keyword/sparse search**
- Qdrant text-index keyword search on `content` payload field
- Merged with dense results via RRF for broader recall

**Stage 3: FalkorDB entity lookup**
- Named entities extracted from query via LLM
- FalkorDB 2-hop Cypher traversal returns linked factIds/episodeIds
- Entity-matched facts merged directly (no RRF — they're fetched by ID)

**Post-retrieval scoring:**
- Recency decay (exponential, rate=0.02)
- Importance score
- Emotional context boost: +0.08 for emotion-matched facts
- LLM-based emotion detection (Claude Haiku) runs concurrently via `detectEmotionFromQuery()`

Do not change scoring weights without understanding the impact on retrieval quality. See `docs/MEMORY_ARCHITECTURE.md`.

### Dynamic Profile Attributes

`MemoryProfile` now includes `dynamicAttributes?: Record<string, DynamicAttribute>`. These are open-ended personality/behavioral traits learned from patterns — not stored in fixed category fields. They are:
- Extracted in real-time from chat (when foundational patterns clearly emerge)
- Extracted during onboarding (from how the user writes and what they share)
- Promoted weekly during consolidation from high-importance semantic facts
- Injected into every Claude system prompt via `buildAllySystemPrompt`

See `packages/shared/src/types/memory.ts` for the `DynamicAttribute` type definition.

### Tool Use

The AI has access to tools via `ai/tools.ts`:
- **`web_search`** — Claude's server-side web search (`web_search_20250305`). Used automatically when the user asks about current events, facts, or anything beyond Claude's training data.
- **`remember_fact`** — Explicitly save important facts to long-term memory.
- **`recall_memory`** — Search the memory store for previously shared facts.
- **`set_reminder`** — Create follow-up reminders for upcoming events or unresolved topics.

Tool calls are handled via an agentic loop in `callClaudeWithTools()` / `callClaudeStreamingWithTools()` (max 5 iterations).

### Model Routing

Chat uses automatic model selection based on message complexity (`ai/conversation.ts`):
- **Claude Haiku 4.5** (`MODEL_FAST`) — default for casual/short messages
- **Claude Sonnet 4.6** (`MODEL_QUALITY`) — for emotional, complex, or long messages (>200 chars or emotional keywords detected)

### Middleware Stack

All requests pass through these middleware layers (in order):
1. **CORS** — `@elysiajs/cors`, configured in `index.ts`. Allows all origins, exposes rate-limit headers.
2. **Logger** — `middleware/logger.ts`. Logs `METHOD /path STATUS duration` for every request. Errors logged separately.
3. **Auth** — `middleware/auth.ts`. Session validation via `better-auth` (`auth.api.getSession()`). Accepts Bearer session tokens from the Expo client. Adds `user` (id, email, tier) to context.
4. **Rate Limiting** — `middleware/rateLimit.ts`. Per-user, two-tier: per-minute burst protection + daily message quotas from `TIER_LIMITS`. Exposes `X-RateLimit-*` headers.
5. **Tier Check** — `middleware/tierCheck.ts`. Gates premium features by user tier.

### AI Service Layer

All AI functions live in `apps/api/src/ai/`:
- `client.ts` — Anthropic SDK wrapper with dual-model support (Haiku 4.5 / Sonnet 4.6), tool-use agentic loops, prompt caching, streaming
- `conversation.ts` — Chat responses with memory context, tool use, model routing, prompt caching (supports both sync and SSE streaming)
- `tools.ts` — Web search tool definition, custom tool definitions (remember_fact, recall_memory, set_reminder), tool execution handlers
- `extraction.ts` — Extract facts from conversations (called by memory queue)
- `onboarding.ts` — Process onboarding answers into memory profile
- `briefing.ts` — Generate morning briefings
- `followup.ts` — Detect unresolved emotional moments
- `prompts.ts` — All system prompts, with few-shot examples and anti-patterns

The AI client (`client.ts`) includes:
- `AIError` class with status codes and retryable flags
- `callClaudeWithTools()` / `callClaudeStreamingWithTools()` — agentic tool-use loops (max 5 iterations)
- `callClaudeStreaming()` for basic SSE streaming (no tools)
- Prompt caching via `cache_control: { type: "ephemeral" }` on system prompt blocks
- `isClaudeReachable()` for health checks

### Error Handling

- External AI/embedding calls wrap errors in `AIError` with proper HTTP status codes (503, 429).
- Embedding service (`services/embedding.ts`) retries up to 2 times with exponential backoff.
- The global error handler in `index.ts` maps error codes: 429 → `RATE_LIMIT_EXCEEDED`, 503 → `AI_UNAVAILABLE`.
- Chat streaming sends `{ type: "error", message }` SSE events instead of crashing the stream.

### Background Jobs & Proactive System

In `apps/api/src/jobs/` and `apps/api/src/services/proactive.ts`. The system uses a hybrid approach:

**Event-driven (proactive):**
- **Briefings** — generated on-demand when the user opens the app (lazy), not pre-generated by cron
- **Re-engagement** — triggered when inactivity is detected (2+ days), not at a fixed time
- **Memory extraction** — real-time via `services/memoryQueue.ts`, not a nightly cron

**Scheduled (still cron-based):**
- `daily_ping` — every minute, checks if it's time to ping each user in their timezone
- `weekly_insights` — Sunday 20:00, emotional week summary for premium users
- `proactive_scan` — every 30min, scans for inactive users and emits events
- `flush_memory_queue` — every 5min, flushes any pending memory extraction batches

**Event system** (`services/events.ts`): Typed event emitter for `user:app_opened`, `user:inactive`, `system:daily_scan`. Proactive handlers registered in `services/proactive.ts`.

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
5. The memory queue in `apps/api/src/services/memoryQueue.ts` controls batching/signal detection — update `shouldExtract()` if changing what triggers extraction
6. For `dynamicAttributes`: update `EXTRACTION_SYSTEM_PROMPT` instructions, the `ExtractionResult` type in `extraction.ts`, and `mergeDynamicAttributes()` in `memory.ts`

### Modify the onboarding flow
1. Seed question prompt is in the mobile app
2. AI followup questions are generated by `ONBOARDING_DYNAMIC_PROMPT` in `prompts.ts`
3. Final processing uses `ONBOARDING_COMPLETE_PROMPT` in `prompts.ts`
4. Route logic in `apps/api/src/routes/onboarding.ts` — `buildProfile()` constructs the initial `MemoryProfile`
5. For dynamic attributes from onboarding: update prompt and `normaliseDynamicAttributes()` in `onboarding.ts`

### Work on the "You" screen
1. Backend: `apps/api/src/routes/profile.ts` → `GET /api/v1/profile/you`
2. Tier gating: All tiers get the full You screen — no fields are locked. Weekly insights and proactive check-ins are still Premium-only, but the profile itself is fully accessible to everyone.
3. Frontend: replace `apps/mobile/app/(tabs)/memory.tsx` with the new You screen design
4. Design spec: `docs/PRODUCT_VISION.md` → "The You Screen" section

### Add a new AI tool
1. Add the tool definition in `apps/api/src/ai/tools.ts` (`getCustomTools()`)
2. Add the handler in `executeToolCall()` in the same file
3. Update the tool usage instructions in the system prompt in `apps/api/src/ai/prompts.ts`
4. Update `docs/FUTURE_ITERATIONS.md` to move the tool from planned to implemented

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
- `ai/client.ts` — `callClaude`, `callClaudeStreaming`, `callClaudeStructured`, `callClaudeWithTools`, `callClaudeStreamingWithTools` return canned responses
- `services/embedding.ts` — `generateEmbedding`, `generateEmbeddings` return zero vectors (1024 dims)

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

## Mobile (apps/mobile/)

### Common Tasks

**Add a new screen:**
1. Create file in the correct stack folder (`app/(tabs)/`, `app/(auth)/`, etc.)
2. If it's a tab, add a `<Tabs.Screen>` entry in `app/(tabs)/_layout.tsx`
3. Use `SafeAreaView` with `edges={["top"]}` for screens under the tab bar

**Add a new API call:**
1. Add the function to `apps/mobile/lib/api.ts`
2. Import the request/response types from `@ally/shared` — do not redeclare types that already exist there
3. Use `apiRequest<T>()` for JSON endpoints; implement manual SSE parsing for streaming

**Add a new theme:**
1. Add a `ThemeDefinition` entry to the `THEMES` array in `constants/themes.ts`
2. Add the corresponding CSS custom property class to `global.css`
3. Update the `ThemeId` union type

**Fix a color/style that doesn't respect the active theme:**
- Never hardcode hex colors. Use NativeWind classes (`text-primary`, `bg-surface`, etc.) for layout.
- For imperative color props (icon `color=`, `placeholderTextColor`, `style={{ color }}`), use `theme.colors["--color-*"]` from `useTheme()`.

### Type-checking

```bash
cd apps/mobile && bun run typecheck
```

Always run before considering mobile work complete.

### Manual Testing

See `docs/MANUAL_TESTING.md` → **Mobile Testing Checklist** section.

## Environment Variables

Required for `apps/api/`:
- `DATABASE_URL` — Neon PostgreSQL connection string
- `ANTHROPIC_API_KEY` — Claude API key
- `VOYAGE_API_KEY` — Voyage AI embedding API key
- `WEBHOOK_SECRET` — Secret for subscription webhook verification
- `QDRANT_URL` — Qdrant Cloud cluster URL (e.g. `https://xxx.qdrant.io`)
- `QDRANT_API_KEY` — Qdrant Cloud API key
- `FALKORDB_URL` — FalkorDB Cloud connection string (e.g. `rediss://default:pass@host:6380`)
- `REDIS_URL` — Optional separate Redis for BullMQ if FalkorDB Redis compatibility is insufficient
- `PORT` — Server port (default 3000)
- `NODE_ENV` — development / production

Test-only (`.env.test` / `.env.test.live`):
- `JWT_SECRET` — Used by `signTestToken()` in `__tests__/helpers/jwt.ts` only. Not used in production (auth is cookie-based via better-auth).
