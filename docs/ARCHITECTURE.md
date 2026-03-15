# Ally Architecture

## Overview

Ally is a personal AI companion that remembers everything users share, sends personalized morning briefings, and follows up on unresolved emotional moments. This document describes the full system architecture.

```
                          +--------------------+
                          |   Mobile App       |
                          |  (Expo / RN 0.83)  |
                          +--------+-----------+
                                   |
                                   | HTTPS / SSE
                                   |
                          +--------v-----------+
                          |   Backend API      |
                          |  (Elysia / Bun)    |
                          +--------+-----------+
                                   |
         +----------+----------+--+------+----------+
         |          |          |         |          |
    +----v---+ +----v---+ +----v---+ +---v----+ +--v-----+
    | Neon   | | Qdrant | | Falkor | | Claude | | Voyage |
    | Postgres| | Cloud  | |  DB    | | (AI)   |  | AI     |
    | (source | | (vector| | (graph | |Haiku+  | |(embed.)|
    |  truth) | | search)| |+queue) | |Sonnet) | |        |
    +--------+ +--------+ +--------+ +--------+ +--------+
```

## Stack

| Layer         | Technology                                                                                               |
|---------------|----------------------------------------------------------------------------------------------------------|
| Runtime       | Bun                                                                                                      |
| Monorepo      | Turborepo with Bun workspaces                                                                            |
| Frontend      | Expo 55 / React Native 0.83, NativeWind, Zustand, expo-router                                           |
| Backend       | Elysia (Bun-native), TypeScript                                                                          |
| Relational DB | PostgreSQL (Neon) + Drizzle ORM — source of truth for users, conversations, sessions, fact metadata      |
| Vector DB     | Qdrant Cloud — dense embeddings for `memory_facts` and `memory_episodes` (cosine search)                |
| Graph DB      | FalkorDB Cloud — entity relationship graph (Cypher) + BullMQ queue backend (Redis protocol)             |
| AI            | Claude Haiku 4.5 (fast) + Sonnet 4.6 (quality) via `@anthropic-ai/sdk`, with server-side web search    |
| Embeddings    | Voyage AI `voyage-4-lite` (1024 dims) with contextual prefixes (asymmetric document/query search)       |
| Auth          | Better Auth (cookie-based sessions)                                                                      |

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
    onboarding.ts       # POST /onboarding/followup, POST /onboarding/complete
    briefing.ts         # GET /briefing (on-demand generation)
    memory.ts           # GET /memory/profile, GET/PATCH/DELETE /memory/facts
    conversations.ts    # Conversation list, history
    insights.ts         # GET /insights/weekly (Premium)
    profile.ts          # GET /profile/you ("You" screen aggregated data)
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
    memory.ts           # Memory profile CRUD + fact/episode/event/entity storage
    memoryQueue.ts      # BullMQ async extraction queue (FalkorDB Redis backend)
    embedding.ts        # Voyage AI embeddings (contextual prefixes, asymmetric search)
    retrieval.ts        # Three-stage hybrid retrieval (Qdrant vector + keyword + FalkorDB entity)
    vectorStore.ts      # Qdrant Cloud client wrapper
    graphStore.ts       # FalkorDB client wrapper (entity graph, Cypher)
    session.ts          # Session detection, summarization, context assembly
    events.ts           # Typed in-process event emitter
    notifications.ts    # Expo Push API helper
    proactive.ts        # Event-driven handlers (briefings, re-engagement)
  jobs/
    scheduler.ts        # In-process job scheduler
    dailyPing.ts        # Per-user timezone daily nudge
    weeklyInsights.ts   # Premium weekly emotional insights
    consolidation.ts    # Weekly episode → semantic fact reflection (Generative Agents pattern)
    maintenance.ts      # Daily: expire episodes, promote past events, importance decay
  db/
    schema.ts           # Drizzle schema (Postgres tables, enums)
    auth-schema.ts      # better-auth schema + app extensions (tier, allyName, push token)
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

### 4. Database (Neon PostgreSQL)

The database is hosted on Neon. Schema is defined in `apps/api/src/db/schema.ts` (app tables) and `apps/api/src/db/auth-schema.ts` (better-auth + app extensions) via Drizzle ORM.

**Note:** Embeddings are NOT stored in Postgres. They live in Qdrant Cloud. The `embedding vector(1024)` column that appeared in the old schema was removed in Phase 2.

**Schema (from `auth-schema.ts` — better-auth tables + app extensions):**

```
user                           ← better-auth managed, extended with app fields
  id                TEXT PRIMARY KEY
  name              TEXT
  email             TEXT UNIQUE
  email_verified    BOOLEAN
  ally_name         TEXT DEFAULT 'Ally'
  notification_preferences  JSONB  -- { dailyPingTime, timezone }
  expo_push_token   TEXT
  tier              TEXT DEFAULT 'free_trial'
  created_at        TIMESTAMP
  updated_at        TIMESTAMP

session                        ← better-auth managed
  id, token, user_id, expires_at, ip_address, user_agent, ...

account                        ← better-auth managed (OAuth providers, credentials)
  id, account_id, provider_id, user_id, password, ...

verification                   ← better-auth managed (email verification)
  id, identifier, value, expires_at, ...
```

**Schema (from `schema.ts` — app tables):**

```
conversations
  id                UUID PRIMARY KEY
  user_id           TEXT REFERENCES user(id) CASCADE
  preview           TEXT
  message_count     INTEGER DEFAULT 0
  created_at        TIMESTAMP WITH TIME ZONE
  last_message_at   TIMESTAMP WITH TIME ZONE
  -- indexes: user_id, (user_id, last_message_at)

sessions_v2                    ← conversation windowing (30min gap = new session)
  id                UUID PRIMARY KEY
  conversation_id   UUID REFERENCES conversations(id) CASCADE
  user_id           TEXT REFERENCES user(id) CASCADE
  summary           TEXT          -- Claude-generated session summary
  message_count     INTEGER DEFAULT 0
  token_estimate    INTEGER DEFAULT 0
  started_at        TIMESTAMP WITH TIME ZONE
  ended_at          TIMESTAMP WITH TIME ZONE
  -- indexes: conversation_id, user_id, (user_id, started_at)

messages
  id                UUID PRIMARY KEY
  conversation_id   UUID REFERENCES conversations(id) CASCADE
  session_id        UUID REFERENCES sessions_v2(id)   -- nullable
  role              ENUM('user', 'ally')
  content           TEXT
  feedback          INTEGER       -- -1 / 0 / 1
  created_at        TIMESTAMP WITH TIME ZONE
  -- indexes: conversation_id, (conversation_id, created_at), session_id

memory_profiles                ← hot memory tier
  user_id           TEXT PRIMARY KEY REFERENCES user(id) CASCADE
  profile           JSONB         -- MemoryProfile (includes dynamicAttributes)
  updated_at        TIMESTAMP WITH TIME ZONE

memory_facts                   ← cold/semantic memory tier (metadata only; vectors in Qdrant)
  id                UUID PRIMARY KEY
  user_id           TEXT REFERENCES user(id) CASCADE
  content           TEXT
  category          ENUM('personal_info','relationships','work','health','interests','goals','emotional_patterns')
  importance        REAL DEFAULT 0.5
  confidence        REAL DEFAULT 0.8
  temporal          BOOLEAN DEFAULT false
  entities          JSONB         -- string[] of entity names
  emotion           TEXT          -- nullable
  source_conversation_id  UUID   -- nullable
  source_date       TIMESTAMP WITH TIME ZONE
  last_accessed_at  TIMESTAMP WITH TIME ZONE   -- nullable
  superseded_by     UUID          -- nullable; set when a newer fact replaces this one
  consolidated_from JSONB         -- UUID[] of episode IDs that produced this fact
  source_type       ENUM('chat','calendar','notes','health') DEFAULT 'chat'
  created_at        TIMESTAMP WITH TIME ZONE
  -- indexes: user_id, (user_id, category)

memory_episodes                ← episodic memory tier (7–30 day TTL; vectors in Qdrant)
  id                UUID PRIMARY KEY
  user_id           TEXT REFERENCES user(id) CASCADE
  content           TEXT
  category          ENUM(same as memory_facts)
  emotion           TEXT          -- nullable
  entities          JSONB         -- string[]
  importance        REAL DEFAULT 0.5
  confidence        REAL DEFAULT 0.8
  expires_at        TIMESTAMP WITH TIME ZONE   -- computed from importance at insert
  consolidated_at   TIMESTAMP WITH TIME ZONE   -- set by consolidation job
  consolidated_into_fact_id  UUID              -- nullable
  source_conversation_id  UUID                 -- nullable
  source_type       ENUM('chat','calendar','notes','health') DEFAULT 'chat'
  source_date       TIMESTAMP WITH TIME ZONE
  created_at        TIMESTAMP WITH TIME ZONE
  -- indexes: user_id, (user_id, expires_at), (user_id, consolidated_at)

memory_events                  ← future-dated events (proactively surfaced, no vectors)
  id                UUID PRIMARY KEY
  user_id           TEXT REFERENCES user(id) CASCADE
  content           TEXT
  event_date        TIMESTAMP WITH TIME ZONE
  context           TEXT          -- nullable
  notified_at       TIMESTAMP WITH TIME ZONE   -- nullable
  completed_at      TIMESTAMP WITH TIME ZONE   -- nullable
  source_conversation_id  UUID                 -- nullable
  source_type       ENUM DEFAULT 'chat'
  created_at        TIMESTAMP WITH TIME ZONE
  -- indexes: user_id, (user_id, event_date, completed_at)

briefings                      ← morning briefings (one per user per day)
  id                UUID PRIMARY KEY
  user_id           TEXT REFERENCES user(id) CASCADE
  date              TEXT          -- 'YYYY-MM-DD'
  content           TEXT
  delivered         BOOLEAN DEFAULT false
  created_at        TIMESTAMP WITH TIME ZONE
  -- unique index: (user_id, date)

weekly_insights                ← premium weekly emotional summaries
  id                UUID PRIMARY KEY
  user_id           TEXT REFERENCES user(id) CASCADE
  week_of           TEXT          -- 'YYYY-MM-DD' (Monday of the week)
  summary           TEXT
  mood_trend        TEXT          -- 'improving'|'declining'|'stable'|'mixed'
  top_themes        JSONB         -- string[]
  follow_up_suggestions  JSONB   -- string[]
  delivered         BOOLEAN DEFAULT false
  created_at        TIMESTAMP WITH TIME ZONE
  -- unique index: (user_id, week_of), index: (user_id, created_at)

job_runs                       ← background job audit log
  id                UUID PRIMARY KEY
  job_name          TEXT
  user_id           TEXT          -- nullable
  status            TEXT DEFAULT 'running'
  metadata          JSONB         -- nullable
  started_at        TIMESTAMP WITH TIME ZONE
  completed_at      TIMESTAMP WITH TIME ZONE   -- nullable
  -- index: (job_name, user_id)
```

**Qdrant Cloud** stores the actual embedding vectors alongside payload metadata for `memory_facts` (type=`"fact"`) and `memory_episodes` (type=`"episode"`). Payload indexes on: `userId`, `category`, `importance`, `emotion`, `content` (text), `sourceType`.

**FalkorDB Cloud** stores entity nodes and relationship edges (Cypher graph). Entity nodes reference fact IDs and episode IDs. Also serves as the Redis-compatible backend for BullMQ.

---

## Memory Architecture (Tiered + Hybrid Retrieval)

See `docs/MEMORY_ARCHITECTURE.md` for the full living document. Summary:

Ally uses a **six-tier memory model**:

| Tier              | Store                              | When Loaded                                                  |
|-------------------|------------------------------------|--------------------------------------------------------------|
| **Hot**           | `memory_profiles.profile` (JSONB)  | Always — injected into every Claude system prompt            |
| **Warm**          | `sessions_v2` summaries            | Last 5 session summaries per conversation                    |
| **Upcoming**      | `memory_events`                    | Events in next 7 days injected into every context build      |
| **Semantic**      | `memory_facts` (Postgres + Qdrant) | Retrieved via three-stage hybrid search                      |
| **Episodic**      | `memory_episodes` (Postgres + Qdrant) | Same retrieval as facts; 7–30 day TTL                     |
| **Entity graph**  | FalkorDB                           | Entity-triggered retrieval at chat time (2-hop traversal)    |

**Hot profile** now includes `dynamicAttributes` — open-ended personality traits Ally learns from patterns over time (communication style, stress response, etc.), promoted by the weekly consolidation job and real-time extraction.

### Three-Stage Hybrid Retrieval

| Stage          | Mechanism                                        | Merged via                    |
|----------------|--------------------------------------------------|-------------------------------|
| Dense vector   | Qdrant cosine similarity (voyage-4-lite 1024d)  | Reciprocal Rank Fusion (RRF)  |
| Sparse/keyword | Qdrant text-index keyword search                 | RRF                           |
| Entity graph   | FalkorDB 2-hop entity traversal → fact IDs       | Direct ID lookup              |

Final scoring after retrieval:
- Recency decay (exponential, rate=0.02)
- Importance score
- Emotional context boost (+0.08 for emotion-matched facts)
- LLM-based emotion detection (Claude Haiku, runs concurrently)

---

## Data Flows

### Chat Message Flow

```
1. User sends message via mobile app
2. Mobile app sends POST /chat with session cookie + message (or SSE stream request)
3. Backend validates session (better-auth), checks rate limit for user's tier
4. Backend resolves conversation session (resolveSession — creates new session if 30min gap)
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
1. After each chat exchange, messages are enqueued via enqueueExtraction()
2. shouldExtract() filters trivial messages (greetings, one-word replies, etc.)
3. Queue accumulates until batch threshold (4 messages) or time window (15s)
4. BullMQ worker (processExtractionJob) fires:
   a. Calls Claude (EXTRACTION_SYSTEM_PROMPT) with the batched messages
   b. Routes extracted facts by memoryType:
      - "semantic" → memory_facts (Postgres) + Qdrant vector upsert
      - "episodic" → memory_episodes (Postgres) + Qdrant vector upsert, TTL from importance
      - "event"    → memory_events (Postgres only, queried by date not vector)
   c. Merges profileUpdates into memory_profiles (hot tier)
   d. Merges dynamicAttributes into memory_profiles if any foundational traits emerged
   e. Stores entity nodes + relationship edges in FalkorDB
5. Failed jobs are retried up to 2 times with exponential backoff (BullMQ)
6. A cron (every 5min) calls flushAllBatches() as a safety net
```

### Onboarding Flow

```
1. Mobile presents seed question ("tell me about yourself")
2. User answers → POST /api/v1/onboarding/followup
3. Backend calls Claude (ONBOARDING_DYNAMIC_PROMPT) to generate 2-3 personalized followup questions
4. Mobile renders AI-generated questions, user answers them
5. User picks daily ping time (HH:MM) and timezone
6. Mobile sends all Q&A → POST /api/v1/onboarding/complete
7. Backend calls Claude (ONBOARDING_COMPLETE_PROMPT):
   a. Processes full conversation into structured MemoryProfile
   b. Extracts dynamicAttributes if clear patterns emerged
   c. Generates personalized first greeting
8. Profile + allyName + notification preferences stored in DB
9. Greeting returned to mobile — appears as Ally's first message
```

---

## Multi-Tenant Isolation

Every request is scoped to a single user via their session (better-auth cookie, or Bearer session token on mobile). The isolation model:

- **Data isolation:** All DB queries are filtered by `user_id`. There is no cross-user data access.
- **Memory isolation:** Each user has their own memory profile and memory_facts. Memory extraction and briefing generation are per-user.
- **Rate limiting:** Tracked per `user_id`, enforced per tier.
- **AI context:** Each AI call receives only the requesting user's data. No shared context between users.
- **Background jobs:** Process users independently. One user's failure does not block others.

### Tier Enforcement

There is no permanent free tier. Users get a **14-day free trial** on signup (full Basic access, no credit card required), then must subscribe to one of two paid tiers.

| Feature                       | Free Trial (14 days) | Basic     | Premium   |
|-------------------------------|----------------------|-----------|-----------|
| Chat messages/day             | Unlimited            | Unlimited | Unlimited |
| Memory retention              | Unlimited            | Unlimited | Unlimited |
| "You" screen (full)           | Yes                  | Yes       | Yes       |
| Morning briefings             | Yes                  | Yes       | Yes       |
| Weekly emotional insights     | No                   | No        | Yes       |
| Proactive check-ins           | No                   | No        | Yes       |
| Habit detection               | No                   | No        | Yes       |
| AI-set goals                  | No                   | No        | Yes       |
| Mood calendar                 | No                   | No        | Yes       |
| Accountability threads        | No                   | No        | Yes       |
| Conversation history          | Unlimited            | Unlimited | Unlimited |

The `Tier` type is `"free_trial" | "basic" | "premium"`. Tier is enforced at the middleware level (`middleware/tierCheck.ts`) before any AI processing occurs.

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
- Neon PostgreSQL (relational source of truth)
- Qdrant Cloud (vector search for facts and episodes)
- FalkorDB Cloud (entity graph + BullMQ queue backend via Redis protocol)
- In-process scheduler + event system
- Dual model routing (Haiku 4.5 / Sonnet 4.6)
- Session windowing with rolling summaries
- Three-stage hybrid retrieval (vector + keyword + entity graph)
- Weekly consolidation (Generative Agents pattern)
- Dynamic profile attributes (learned from patterns over time)

**Phase 2 (1K–10K users):**
- App integrations: Calendar (`sourceType: 'calendar'`), Notes, Health data
- Behavioral intelligence features: habit detection, goal scaffolding, AI-set goals, mood calendar
- Trigger.dev or separate worker process for heavy background jobs
- Connection pooling (PgBouncer or Neon pooler)
- A/B testing framework for prompt quality

**Phase 3 (10K+ users):**
- Horizontal scaling behind load balancer
- Separate worker process for memory extraction (decouple from API server)
- Job sharding across workers
- Fine-tuned model for conversation quality
