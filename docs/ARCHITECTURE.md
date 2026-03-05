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
| AI           | Claude claude-sonnet-4-6 via @anthropic-ai/sdk  |
| Embeddings   | Voyage AI voyage-3-lite (1024 dimensions)        |
| Auth         | JWT verification (tokens issued by mobile team)  |

All AI logic is implemented in TypeScript. No Python.

---

## Responsibility Split

### This Repo Contains

| Component       | Tech Stack        | Purpose                                                  |
|-----------------|-------------------|----------------------------------------------------------|
| Backend API     | Elysia (Bun)      | REST endpoints for chat, onboarding, memory, briefings   |
| AI Layer        | TypeScript + Claude | Conversation handling, memory extraction, briefing gen  |
| Background Jobs | TypeScript        | Nightly extraction, daily briefings, weekly insights, re-engagement |
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
│           ├── ai/              # client, conversation, extraction, briefing, followup, onboarding, prompts
│           ├── services/        # memory, embedding, retrieval (hybrid search)
│           ├── jobs/            # scheduler, nightlyExtraction, dailyBriefings, weeklyInsights, reengagement
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
    chat.ts             # POST /chat
    onboarding.ts       # POST /onboarding
    briefing.ts         # GET /briefing
    memory.ts           # GET /memory/profile
    conversations.ts    # Conversation list, history
    insights.ts         # Weekly insights (Premium)
    webhooks.ts         # Stripe, push callbacks
    health.ts           # Health check
  middleware/
    auth.ts             # JWT verification
    tierCheck.ts        # Feature gating by subscription tier
  ai/
    client.ts           # Anthropic SDK wrapper
    conversation.ts     # Chat turn handling
    extraction.ts       # Memory extraction
    briefing.ts         # Briefing generation
    followup.ts         # Follow-up detection
    onboarding.ts       # Onboarding processing
    prompts/            # System, briefing, extraction prompts
  services/
    memory.ts           # Memory profile CRUD
    embedding.ts        # Voyage AI embeddings
    retrieval.ts        # Hybrid search (semantic + FTS + recency)
  jobs/
    scheduler.ts        # In-process job scheduler
    nightlyExtraction.ts
    dailyBriefings.ts
    weeklyInsights.ts
    reengagement.ts
  db/
    schema.ts           # Drizzle schema + pgvector
    migrations/         # SQL migrations
```

### 2. AI Layer (TypeScript + Claude)

All AI logic lives in TypeScript modules using the `@anthropic-ai/sdk`. Every AI call uses `claude-sonnet-4-6`.

**Key responsibilities:**
- Process chat messages with full memory context (hot + warm + cold)
- Extract facts from conversations (nightly batch job)
- Generate personalized morning briefings
- Process onboarding answers into initial memory profiles
- Detect emotional patterns and flag follow-up opportunities

**Directory:** `apps/api/src/ai/`

### 3. Background Jobs

Scheduled tasks that run in-process (Phase 1) or via Trigger.dev (Phase 2+).

| Job                    | Schedule       | Module                      | Purpose                                         |
|------------------------|----------------|-----------------------------|-------------------------------------------------|
| Nightly Extraction     | 11:00 PM daily | `jobs/nightlyExtraction.ts` | Extract facts from today's conversations        |
| Daily Briefings        | 5:00 AM daily  | `jobs/dailyBriefings.ts`    | Generate personalized briefing per user (Pro+)  |
| Weekly Insights        | Sunday 8:00 PM | `jobs/weeklyInsights.ts`    | Emotional week summary (Premium)                |
| Re-engagement          | 6:00 PM daily  | `jobs/reengagement.ts`      | Check-in with inactive users (3+ days)         |

**Directory:** `apps/api/src/jobs/`

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
  role            ENUM('user', 'ally')
  content         TEXT
  created_at      TIMESTAMP

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
| Semantic similarity    | 40%    | pgvector cosine distance (Voyage voyage-3-lite) |
| Full-text matching    | 20%    | PostgreSQL tsvector/tsquery                    |
| Recency decay         | 25%    | Exponential decay by `source_date`             |
| Importance scoring    | 15%    | Stored `importance` field                     |

Embeddings are 1024-dimensional (Voyage AI voyage-3-lite). The `memory_facts` table has an HNSW vector index for fast approximate nearest-neighbor search.

---

## Data Flows

### Chat Message Flow

```
1. User sends message via mobile app
2. Mobile app sends POST /chat with JWT + message
3. Backend validates JWT, checks rate limit for user's tier
4. Backend loads context:
   a. Hot memory: user's memory profile from memory_profiles
   b. Warm memory: recent conversation history from messages
   c. Cold memory: hybrid search on memory_facts (embedding + FTS + recency)
5. AI layer (conversation.ts):
   a. Builds full context (system prompt + hot + warm + cold + new message)
   b. Calls Claude claude-sonnet-4-6 via @anthropic-ai/sdk
   c. Returns Ally's response
6. Backend stores both messages in DB
7. Backend returns Ally's response to mobile app
```

### Morning Briefing Flow

```
1. Job fires at 5:00 AM (dailyBriefings)
2. For each user with briefings enabled (Pro + Premium):
   a. Load user's memory profile (hot)
   b. Load recent facts and any pending follow-ups (cold)
   c. Call Claude claude-sonnet-4-6 with briefing prompt + context
   d. Store generated briefing in briefings table
   e. Mobile team triggers push notification
```

### Nightly Memory Extraction Flow

```
1. Job fires at 11:00 PM (nightlyExtraction)
2. For each user with conversations today:
   a. Load all messages from the day
   b. Load existing memory profile
   c. Call Claude claude-sonnet-4-6 with extraction prompt + messages
   d. Claude returns structured facts
   e. Generate embeddings for each fact via Voyage AI
   f. Insert new rows into memory_facts
   g. Merge high-level updates into memory_profiles.profile
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

**Phase 1 (MVP, <1K users):**
- Single Bun process
- Neon free tier
- In-process cron (scheduler.ts)
- pgvector for embeddings
- All AI logic in TypeScript

**Phase 2 (1K–10K users):**
- Redis for rate limiting and caching
- Trigger.dev for background jobs
- Tune HNSW indexes for pgvector
- Consider connection pooling

**Phase 3 (10K+ users):**
- Dedicated vector DB (e.g., Qdrant) if pgvector becomes a bottleneck
- Horizontal scaling behind load balancer
- Job sharding across workers
- Python AI service only if TypeScript throughput limits are hit
