# Ally Architecture

## Overview

Ally is a personal AI companion that remembers everything users share, sends personalized morning briefings, and follows up on unresolved emotional moments. This document describes the full system architecture.

```
                          +--------------------+
                          |   Mobile App       |
                          |  (Expo / RN 0.83)  |
                          |  [Mobile Team]     |
                          +--------+-----------+
                                   |
                                   | HTTPS / JWT
                                   |
                          +--------v-----------+
                          |   Backend API      |
                          |  (Elysia / Bun)    |
                          |  [This Repo]       |
                          +--------+-----------+
                                   |
                    +--------------+--------------+
                    |              |               |
           +-------v---+  +------v------+  +-----v-------+
           | AI Layer   |  | Background |  | Database    |
           | (TypeScript|  | Jobs       |  | (PostgreSQL |
           | + Claude)  |  | (in-process|  | + pgvector) |
           | [This Repo]|  | [This Repo]|  | [Neon]      |
           +------------+  +-------------+  +-------------+
```

## Stack

| Layer        | Technology                                      |
|--------------|--------------------------------------------------|
| Runtime      | Bun                                              |
| Monorepo     | Turborepo with Bun workspaces                    |
| Frontend     | Expo 55 / React Native 0.83, NativeWind, Zustand, expo-router |
| Backend      | Elysia (Bun-native), TypeScript                  |
| Database     | PostgreSQL + pgvector (Neon)                     |
| ORM          | Drizzle ORM                                      |
| AI           | Claude Haiku 4.5 (fast) + Sonnet 4.6 (quality) via @anthropic-ai/sdk, with server-side web search and custom tools |
| Embeddings   | Voyage AI voyage-4-lite (1024 dims) with contextual prefixes |
| Auth         | Better Auth (cookie-based sessions)               |

All AI logic is implemented in TypeScript. No Python.

---

## Responsibility Split

### This Repo Contains

| Component       | Tech Stack        | Purpose                                                  |
|-----------------|-------------------|----------------------------------------------------------|
| Backend API     | Elysia (Bun)      | REST endpoints for chat, onboarding, memory, briefings   |
| AI Layer        | TypeScript + Claude | Conversation handling, memory extraction, briefing gen  |
| Background Jobs | TypeScript        | Daily ping, weekly insights, proactive scans, memory queue flush |
| Proactive System| TypeScript        | Event-driven briefings, re-engagement, signal detection         |
| Frontend        | Expo / React Native | Mobile app (iOS + Android)                              |
| Documentation   | Markdown          | Architecture, API docs, memory system, personality guide |

### Mobile Team Builds

| Component          | Purpose                                                  |
|--------------------|----------------------------------------------------------|
| Database Hosting   | Neon PostgreSQL, schema, migrations                      |
| Authentication     | JWT issuance, user signup/login, token refresh           |
| Stripe Integration | Subscription management, tier enforcement                |
| Push Notifications | APNs/FCM integration, delivery infrastructure           |

---

## Directory Structure

```
ally-app/
├── apps/
│   ├── mobile/          # Expo React Native (iOS + Android)
│   └── api/             # Elysia backend (TypeScript)
│       └── src/
│           ├── index.ts         # Entry point
│           ├── routes/          # chat, onboarding, briefing, memory, conversations, insights, webhooks, health
│           ├── middleware/     # auth (JWT), tierCheck
│           ├── ai/              # client, conversation, tools, extraction, briefing, followup, onboarding, prompts
│           ├── services/        # memory, memoryQueue, embedding, retrieval, session, events, proactive
│           ├── jobs/            # scheduler, dailyPing, weeklyInsights
│           └── db/              # schema (Drizzle + pgvector), migrations
├── packages/
│   ├── shared/          # Types, Zod schemas, constants (tiers, errors)
│   └── tsconfig/        # Shared TS configs (base, node, react-native)
├── docs/
└── _legacy/             # Old Node/Express + Python implementation
```

---

## Component Breakdown

### 1. Backend API (Elysia / Bun)

The central REST API that the mobile app communicates with. Handles request validation, authentication verification, tier enforcement, and routes work to the AI layer.

**Key responsibilities:**
- Validate incoming JWTs (issued by the mobile team's auth service)
- Enforce rate limits per tier
- Route chat messages to the AI layer
- Serve memory profiles and briefings from storage
- Expose onboarding, conversations, insights, and webhook endpoints

**Directory:** `apps/api/src/`

```
apps/api/src/
  index.ts              # Elysia app entry point
  routes/
    chat.ts             # POST /chat, POST /chat/feedback
    onboarding.ts       # POST /onboarding
    briefing.ts         # GET /briefing (on-demand generation)
    memory.ts           # GET /memory/profile
    conversations.ts    # Conversation list, history
    insights.ts         # Weekly insights (Premium)
    webhooks.ts         # Stripe, push callbacks
    health.ts           # Health check
  middleware/
    auth.ts             # JWT verification
    tierCheck.ts        # Feature gating by subscription tier
    rateLimit.ts        # Per-user rate limiting
    logger.ts           # Request logging
  ai/
    client.ts           # Anthropic SDK wrapper (dual model, tool loops, prompt caching)
    conversation.ts     # Chat turn handling (model routing, tool use)
    tools.ts            # Web search + custom tool definitions and execution
    extraction.ts       # Memory extraction
    briefing.ts         # Briefing generation
    followup.ts         # Follow-up detection
    onboarding.ts       # Onboarding processing
    prompts.ts          # System, briefing, extraction prompts (with few-shot examples)
  services/
    memory.ts           # Memory profile CRUD + fact storage
    memoryQueue.ts      # Async batched memory extraction queue
    embedding.ts        # Voyage AI embeddings (contextual prefixes, asymmetric search)
    retrieval.ts        # Hybrid search (query expansion, semantic + FTS + recency)
    session.ts          # Session detection, summarization, context assembly
    events.ts           # Typed in-process event emitter
    proactive.ts        # Event-driven proactive handlers (briefings, re-engagement)
  jobs/
    scheduler.ts        # In-process job scheduler
    dailyPing.ts        # Per-user timezone daily nudge
    weeklyInsights.ts   # Premium weekly emotional insights
  db/
    schema.ts           # Drizzle schema + pgvector + sessions_v2
    migrations/         # SQL migrations
```

### 2. AI Layer (TypeScript + Claude)

All AI logic lives in TypeScript modules using the `@anthropic-ai/sdk`. Uses dual models: **Haiku 4.5** (fast, casual) and **Sonnet 4.6** (quality, complex/emotional).

**Key responsibilities:**
- Process chat messages with full memory context (hot + warm + cold) and tool use
- Use web search for up-to-date information (Claude's server-side `web_search_20250305`)
- Use custom tools: `remember_fact`, `recall_memory`, `set_reminder`
- Extract facts from conversations (real-time via memory queue, not nightly)
- Generate personalized morning briefings (on-demand)
- Process onboarding answers into initial memory profiles
- Detect emotional patterns and flag follow-up opportunities

**Model routing:** Messages are classified by `classifyMessageComplexity()` — short/casual goes to Haiku, long/emotional/complex goes to Sonnet.

**Prompt caching:** System prompts are wrapped with `cache_control: { type: "ephemeral" }` to reduce token costs on repeated calls.

**Directory:** `apps/api/src/ai/`

### 3. Background Jobs & Proactive System

The system uses a hybrid approach — event-driven for reactive behaviors, cron-based for periodic scans.

**Event-driven (via `services/events.ts` + `services/proactive.ts`):**

| Trigger              | Handler                | What it does                                         |
|----------------------|------------------------|------------------------------------------------------|
| `user:app_opened`    | `handleAppOpened()`    | Generate today's briefing if not yet created         |
| `user:inactive`      | `handleInactivity()`   | Send re-engagement push notification                 |
| Chat message sent    | `enqueueExtraction()`  | Queue message for async memory extraction            |

**Cron-based (via `jobs/scheduler.ts`):**

| Job                  | Schedule        | Module                    | Purpose                                        |
|----------------------|-----------------|---------------------------|-------------------------------------------------|
| Daily Ping           | Every minute    | `jobs/dailyPing.ts`       | Per-user timezone nudge                         |
| Weekly Insights      | Sunday 20:00    | `jobs/weeklyInsights.ts`  | Emotional week summary (Premium)                |
| Proactive Scan       | Every 30 min    | (inline)                  | Emit `system:daily_scan`, detect inactive users |
| Memory Queue Flush   | Every 5 min     | (inline)                  | Flush pending memory extraction batches         |

**Directories:** `apps/api/src/jobs/` and `apps/api/src/services/proactive.ts`

### 4. Database (Neon PostgreSQL + pgvector)

The database is hosted on Neon. This repo defines the schema via Drizzle and runs migrations.

**Schema:**

```
users
  id              UUID PRIMARY KEY
  email           TEXT UNIQUE
  name            TEXT
  tier            ENUM('free_trial', 'basic', 'pro', 'premium')
  trial_ends_at   TIMESTAMP
  created_at      TIMESTAMP

conversations
  id              UUID PRIMARY KEY
  user_id         UUID REFERENCES users(id)
  preview         TEXT
  message_count   INTEGER
  created_at      TIMESTAMP
  last_message_at TIMESTAMP

messages
  id              UUID PRIMARY KEY
  conversation_id UUID REFERENCES conversations(id)
  session_id      UUID REFERENCES sessions_v2(id)
  role            ENUM('user', 'ally')
  content         TEXT
  feedback        INTEGER (-1, 0, 1)
  created_at      TIMESTAMP

sessions_v2
  id              UUID PRIMARY KEY
  conversation_id UUID REFERENCES conversations(id)
  user_id         UUID REFERENCES users(id)
  summary         TEXT
  message_count   INTEGER
  token_estimate  INTEGER
  started_at      TIMESTAMP
  ended_at        TIMESTAMP

memory_profiles
  user_id         UUID PRIMARY KEY REFERENCES users(id)
  profile         JSONB
  updated_at      TIMESTAMP

memory_facts
  id                      UUID PRIMARY KEY
  user_id                 UUID REFERENCES users(id)
  content                 TEXT
  category                TEXT
  importance              FLOAT
  confidence              FLOAT
  temporal                TEXT
  entities                JSONB
  emotion                 TEXT
  embedding               vector(1024)    -- pgvector
  source_conversation_id   UUID
  source_date             TIMESTAMP
  last_accessed_at        TIMESTAMP
  created_at              TIMESTAMP
  -- HNSW vector index, GIN full-text index, B-tree on user+category

briefings
  id              UUID PRIMARY KEY
  user_id         UUID REFERENCES users(id)
  date            DATE
  content         TEXT
  delivered       BOOLEAN DEFAULT FALSE
  created_at      TIMESTAMP

job_runs
  id              UUID PRIMARY KEY
  job_name        TEXT
  user_id         UUID
  status          TEXT
  metadata        JSONB
  started_at      TIMESTAMP
  completed_at    TIMESTAMP
```

---

## Memory Architecture (Tiered + Hybrid Retrieval)

Ally uses a three-tier memory model:

| Tier   | Source                    | When Loaded                    |
|--------|---------------------------|--------------------------------|
| **Hot**  | `memory_profiles.profile` (JSONB) | Always — name, relationships, goals, emotional patterns |
| **Warm** | Recent conversation history | Last N messages from active conversation |
| **Cold** | `memory_facts` with embeddings | Retrieved via hybrid search when relevant |

### Cold Memory Retrieval (Hybrid Search)

Facts are retrieved using a weighted combination of:

| Signal                 | Weight | Mechanism                                      |
|------------------------|--------|------------------------------------------------|
| Semantic similarity    | 40%    | pgvector cosine distance (Voyage voyage-4-lite) |
| Full-text matching    | 20%    | PostgreSQL tsvector/tsquery                    |
| Recency decay         | 25%    | Exponential decay by `source_date`             |
| Importance scoring    | 15%    | Stored `importance` field                     |

Embeddings are 1024-dimensional (Voyage AI voyage-4-lite). The `memory_facts` table has an HNSW vector index for fast approximate nearest-neighbor search.

---

## Data Flows

### Chat Message Flow

```
1. User sends message via mobile app
2. Mobile app sends POST /chat with JWT + message (or SSE stream request)
3. Backend validates JWT, checks rate limit for user's tier
4. Backend resolves session (resolveSession — creates new session if 30min gap)
5. Backend loads context in parallel:
   a. Hot memory: user's memory profile from memory_profiles
   b. Warm memory: session summaries (last 5) + active session messages (up to 30)
   c. Cold memory: query expansion + parallel hybrid searches on memory_facts
6. AI layer (conversation.ts):
   a. Classifies message complexity → selects Haiku (fast) or Sonnet (quality)
   b. Builds cached system prompt (profile + cold facts + session summaries)
   c. Assembles tools (web search + custom tools based on context)
   d. Calls Claude via tool-use agentic loop (up to 5 tool iterations)
   e. Streams response back via SSE
7. Backend stores both messages in DB (with sessionId)
8. Backend enqueues messages for async memory extraction (memoryQueue)
9. Response streams to mobile app token-by-token
```

### Morning Briefing Flow (On-Demand)

```
1. User opens the app → mobile sends GET /briefing
2. Backend emits 'user:app_opened' event
3. If no briefing exists for today:
   a. Load user's memory profile (hot)
   b. Load recent facts and any pending follow-ups (cold)
   c. Call Claude Sonnet with briefing prompt + context
   d. Store generated briefing in briefings table
4. Mark briefing as delivered, return to mobile app
```

### Real-Time Memory Extraction Flow

```
1. After each chat exchange, messages are enqueued in memoryQueue.ts
2. shouldExtract() filters trivial messages (greetings, one-word replies, etc.)
3. Queue accumulates until batch threshold (4 messages) or time window (15s)
4. processBatch() fires:
   a. Calls Claude (extraction prompt) with the batched messages
   b. For each extracted fact:
      - Adds contextual prefix based on category
      - Generates embedding via Voyage AI
      - Inserts into memory_facts
   c. Merges profile updates into memory_profiles
5. Failed batches are retried up to 2 times with exponential backoff
6. A cron (every 5min) calls flushAllBatches() as a safety net
```

### Onboarding Flow

```
1. User completes onboarding questions in mobile app
2. Mobile app sends POST /onboarding with answers
3. Backend calls ai/onboarding.ts with answers
4. onboarding.ts:
   a. Calls Claude claude-sonnet-4-6 to process answers into structured memory
   b. Creates initial memory profile in memory_profiles
   c. Generates Ally's first personalized greeting
5. Backend stores memory profile in DB
6. Backend returns greeting to mobile app
```

---

## Multi-Tenant Isolation

Every request is scoped to a single user via their JWT. The isolation model:

- **Data isolation:** All DB queries are filtered by `user_id`. There is no cross-user data access.
- **Memory isolation:** Each user has their own memory profile and memory_facts. Memory extraction and briefing generation are per-user.
- **Rate limiting:** Tracked per `user_id`, enforced per tier.
- **AI context:** Each AI call receives only the requesting user's data. No shared context between users.
- **Background jobs:** Process users independently. One user's failure does not block others.

### Tier Enforcement

| Feature                    | Free Trial | Basic ($9.99) | Pro ($19.99) | Premium ($49.99) |
|----------------------------|-----------|---------------|--------------|-------------------|
| Chat messages/day          | 20        | 50            | Unlimited    | Unlimited         |
| Memory retention           | 14 days   | 90 days       | Unlimited    | Unlimited         |
| Morning briefings          | No        | No            | Yes          | Yes               |
| Proactive follow-ups       | No        | No            | No           | Yes               |
| Weekly emotional insights  | No        | No            | No           | Yes               |
| Conversation history       | 7 days    | 30 days       | Unlimited    | Unlimited         |

Tier is checked at the middleware level before any AI processing occurs. The mobile team's auth service includes the user's current tier in the JWT payload.

---

## Mobile Architecture

The Expo/React Native frontend lives in `apps/mobile/`. It communicates exclusively with the Elysia API over HTTP/SSE.

### Navigation (expo-router)

File-based routing with three top-level stacks:

```
app/
  index.tsx          ← auth + onboarding guard (redirects to correct stack)
  _layout.tsx        ← root: GestureHandler > ErrorBoundary > ThemeProvider > Stack
  (auth)/            ← sign-in, sign-up (unauthenticated only)
  (onboarding)/      ← dynamic multi-phase onboarding flow
  (tabs)/            ← main app: Chat, Memory Vault, Settings
```

The root guard in `app/index.tsx` checks `useSession()` (better-auth) and `isOnboarded` (Zustand) to decide which stack to enter. There is no server-side session fetch in the guard — onboarding state comes from AsyncStorage-persisted Zustand.

### State Management

A single Zustand store (`store/useAppStore.ts`) persisted to AsyncStorage under `"ally-app-storage"`:

| Field | Purpose |
|---|---|
| `isOnboarded` | Guards onboarding route |
| `user` | Name, allyName, job, briefingTime, timezone — set on onboarding completion |
| `activeConversationId` | Backend conversation ID for the ongoing session |
| `messages` | Full in-memory + persisted chat log (local source of truth) |

Chat messages live only in local Zustand storage. There is no server-side message hydration — `getConversations` / `getConversationMessages` exist in `lib/api.ts` for a future chat history screen.

### SSE Streaming

`sendMessageStreaming()` in `lib/api.ts` opens a `POST /api/v1/chat` with `stream: true`. It manually reads the `ReadableStream`, splits on `"\n\n"`, and dispatches `onToken` / `onDone` / `onError` callbacks. The chat screen uses these callbacks to:

1. Show `TypingIndicator` before the first token
2. Call `addMessage("", false)` on first token to create the reply bubble
3. Call `updateLastMessage(token)` for each subsequent token (appends to the last message)

### Theme System

Eight themes (4 light/dark pairs: Sand & Sage, Terracotta, Lavender, Honey & Forest) defined in `constants/themes.ts`. Each theme is a map of 9 CSS custom property tokens (`--color-primary`, `--color-background`, etc.).

The `ThemeProvider` (`context/ThemeContext.tsx`) injects these as NativeWind CSS variables via `vars(theme.colors)` on the root `View`. All component colors use NativeWind utility classes (e.g., `bg-primary`, `text-foreground`) that reference these variables. Hardcoded hex colors are avoided — icon colors and imperative styles use `theme.colors["--color-*"]` tokens directly.

### Auth

`lib/auth.ts` uses `better-auth` with the `@better-auth/expo` client plugin. Session tokens are stored in `expo-secure-store`. React Native doesn't manage cookies automatically, so `lib/api.ts` reads `authClient.getCookie()` and injects it as a `Cookie` header on every request.

### API Client (`lib/api.ts`)

All types are imported from `@ally/shared` (no local duplicates). The `MemoryFactItem` interface is the only locally defined type — it's a `Pick<MemoryFact, ...>` representing the subset returned by the list endpoint.

`ApiError` (custom class with `status: number`) is thrown for any non-2xx response. Error messages are extracted from `body?.error?.message ?? body?.message` to match the Elysia error response shape.

### Error Handling

- Root `ErrorBoundary` (`components/ui/ErrorBoundary.tsx`) catches unhandled render errors and shows a "Try Again" fallback screen.
- Chat errors appear inline as ally messages (not alerts) to maintain conversation flow.
- Memory edit/delete errors surface as `Alert.alert`.
- Settings destructive actions (clear memories, reset) surface as `Alert.alert` on failure.

---

## Environment Variables

| Variable             | Purpose                                    | Example                          |
|----------------------|--------------------------------------------|----------------------------------|
| `DATABASE_URL`       | PostgreSQL connection string (Neon)        | `postgres://user:pass@host/db`   |
| `ANTHROPIC_API_KEY`  | Claude API authentication                  | `sk-ant-...`                     |
| `VOYAGE_API_KEY`     | Voyage AI embeddings                       | `pa-...`                         |
| `JWT_SECRET`         | Shared secret for JWT verification         | (from mobile team)               |
| `WEBHOOK_SECRET`     | Stripe/webhook signature verification      | `whsec_...`                      |
| `PORT`               | Elysia server port                         | `3000`                           |
| `NODE_ENV`           | Environment flag                           | `development` / `production`     |

---

## Scaling Phases

**Phase 1 (MVP, <1K users) — Current:**
- Single Bun process
- Neon free tier
- In-process scheduler + event system
- pgvector for embeddings with contextual prefixes
- In-process memory queue for async extraction
- Dual model routing (Haiku 4.5 / Sonnet 4.6)
- Session windowing with rolling summaries
- All AI logic in TypeScript

**Phase 2 (1K–10K users):**
- Redis for rate limiting, profile caching, session caching, memory queue persistence
- Graph-based memory retrieval (supplement or replace vector search)
- Trigger.dev for background jobs
- Tune HNSW indexes for pgvector
- Consider connection pooling
- A/B testing framework for prompt quality

**Phase 3 (10K+ users):**
- Dedicated vector DB (e.g., Qdrant) if pgvector becomes a bottleneck
- Horizontal scaling behind load balancer
- Job sharding across workers
- Fine-tuned model for conversation quality (if off-the-shelf hits ceiling)
