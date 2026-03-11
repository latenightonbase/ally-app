# Ally Memory System

"The friend who never forgets."

Ally's memory system is the core differentiator. It extracts, stores, and recalls personal facts so that every conversation feels continuous and deeply personal, not like talking to a blank-slate chatbot.

---

## Memory Categories

Every fact Ally stores is classified into one of seven categories:

### 1. `personal_info`
Basic biographical information about the user.

**Examples:**
- Preferred name ("Sar")
- Age, birthday
- Location ("Austin, TX")
- Living situation ("Lives with partner and dog")
- Cultural background

### 2. `relationships`
People in the user's life and the dynamics between them.

**Examples:**
- "Best friend Maya -- they vent to each other about work"
- "Partner named Alex -- they've been together 3 years"
- "Manager David -- good relationship but he gives vague feedback"
- "Mom -- they try to call weekly, Sarah sometimes feels guilty about missing calls"

### 3. `work`
Professional life, career, and work-related context.

**Examples:**
- Job title and company type
- Current projects and deadlines
- Career goals
- Work stressors
- Colleagues and work relationships (cross-referenced with `relationships`)

### 4. `health`
Physical and mental health information.

**Examples:**
- Fitness goals and routines
- Sleep patterns mentioned
- Dietary preferences or restrictions
- Mental health context (e.g., "sees a therapist every other Thursday")
- Medical events mentioned in conversation

### 5. `interests`
Hobbies, media preferences, things they enjoy.

**Examples:**
- "Loves true crime podcasts"
- "Learning to cook Italian food"
- "Reads before bed most nights"
- "Obsessed with The Bear (TV show)"

### 6. `goals`
Active goals the user is working toward, with status tracking.

**Examples:**
- "Get promoted this quarter (career, active)"
- "Run a half marathon by June (fitness, active)"
- "Read 24 books this year (personal, active -- currently at 6)"
- "Learn Spanish (personal, paused)"

### 7. `emotional_patterns`
Recurring emotional themes, stressors, and coping mechanisms.

**Examples:**
- "Work deadlines are the primary source of stress"
- "Tends to downplay accomplishments"
- "Gets anxious before big presentations but performs well"
- "Feels guilty about not staying in touch with family"
- "Running is a key stress relief mechanism"

---

## Memory Profile Schema

Each user has a single memory profile stored as a JSON document. Here is the full schema:

```json
{
  "user_id": "uuid",
  "version": 2,
  "personal_info": {
    "preferred_name": "string",
    "full_name": "string | null",
    "age": "number | null",
    "birthday": "string | null (YYYY-MM-DD)",
    "location": "string | null",
    "living_situation": "string | null",
    "other": {}
  },
  "relationships": [
    {
      "name": "string",
      "relation": "string (friend, partner, parent, sibling, colleague, etc.)",
      "notes": "string (freeform context about the relationship)",
      "last_mentioned": "string (YYYY-MM-DD)"
    }
  ],
  "work": {
    "role": "string | null",
    "company": "string | null",
    "company_type": "string | null",
    "current_projects": ["string"],
    "current_goals": ["string"],
    "stressors": ["string"],
    "colleagues": ["string (names, cross-ref with relationships)"]
  },
  "health": {
    "fitness_goals": ["string"],
    "current_routine": "string | null",
    "sleep_notes": "string | null",
    "diet_notes": "string | null",
    "mental_health_notes": "string | null",
    "other": {}
  },
  "interests": [
    {
      "topic": "string",
      "detail": "string | null",
      "first_mentioned": "string (YYYY-MM-DD)"
    }
  ],
  "goals": [
    {
      "description": "string",
      "category": "string (career, fitness, personal, financial, etc.)",
      "status": "string (active, completed, paused, abandoned)",
      "progress_notes": "string | null",
      "created_at": "string (YYYY-MM-DD)",
      "updated_at": "string (YYYY-MM-DD)"
    }
  ],
  "emotional_patterns": {
    "primary_stressors": ["string"],
    "coping_mechanisms": ["string"],
    "mood_trends": [
      {
        "period": "string (YYYY-MM-DD)",
        "trend": "string (improving, declining, stable, mixed)",
        "notes": "string"
      }
    ],
    "recurring_themes": ["string"],
    "sensitivities": ["string (topics to handle with extra care)"]
  },
  "pending_followups": [
    {
      "topic": "string",
      "context": "string",
      "detected_at": "string (YYYY-MM-DD)",
      "resolved": false,
      "priority": "string (high, medium, low)"
    }
  ],
  "updated_at": "string (ISO 8601)"
}
```

---

## Database Schema: memory_facts

Extracted facts are stored in PostgreSQL with pgvector for semantic search. The `memory_facts` table:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `userId` | UUID | References user |
| `content` | TEXT | The fact itself |
| `category` | ENUM | One of the 7 memory categories |
| `importance` | REAL | 0.0–1.0, assigned during extraction |
| `confidence` | REAL | 0.0–1.0, extraction certainty |
| `temporal` | BOOLEAN | Whether the fact has a time component |
| `entities` | JSONB | Names, places, events mentioned |
| `emotion` | TEXT | Emotion if relevant |
| `embedding` | VECTOR(1024) | Voyage AI embedding for semantic search |
| `sourceConversationId` | UUID | Conversation the fact was extracted from |
| `sourceDate` | TIMESTAMP | When the source conversation occurred |
| `lastAccessedAt` | TIMESTAMP | Last time this fact was retrieved |
| `createdAt` | TIMESTAMP | When the fact was stored |

**Indexes:**
- **HNSW** on `embedding` (vector cosine distance) — for fast semantic similarity search
- **GIN** on `to_tsvector('english', content)` — for full-text search
- **B-tree** on `(userId, category)` — for user-scoped category filtering

---

## Hybrid Retrieval (with Query Expansion)

Memory retrieval uses a multi-step pipeline for high-quality recall. Implemented in `apps/api/src/services/retrieval.ts`.

### Pipeline

1. **Query expansion** — the user's message is expanded into 2-3 semantically varied queries (e.g., "How's your marathon training?" → ["marathon training progress", "running fitness goals", "exercise routine updates"])
2. **Contextual embedding** — each expanded query is embedded with a contextual prefix using Voyage AI (`inputType: "query"`)
3. **Parallel hybrid search** — each expanded query runs its own hybrid search SQL query in parallel
4. **Deduplication + re-ranking** — results are merged by fact ID (taking the best score), then sorted by hybrid score

### Scoring Components

Each hybrid search scores facts using a weighted combination:

| Signal | Weight | Description |
|--------|--------|-------------|
| **Semantic similarity** | 40% | pgvector cosine distance between query embedding and fact embedding. `(1 - (embedding <=> query_embedding))` maps distance to similarity (0–1). |
| **Full-text matching** | 20% | PostgreSQL `ts_rank` on `to_tsvector(content)` vs `to_tsquery(keywords)`. Catches exact phrase and keyword matches. |
| **Recency decay** | 25% | Exponential decay with rate=0.02 (~35-day half-life): `EXP(-0.02 * days_since_created)`. Recent facts rank higher. |
| **Importance** | 15% | Value assigned during extraction (0–1). Life events, relationships, health issues get higher importance. |

### Importance Feedback Loop

When facts are retrieved (`touchFacts`), their `importance` is incremented by 0.02 (capped at 1.0) and `last_accessed_at` is updated. This creates a positive feedback loop where frequently relevant facts surface more easily over time.

### Simplified SQL Query (per expanded query)

```sql
SELECT
  id, content, category, importance, created_at,
  (
    (1 - (embedding <=> $query_embedding::vector)) * 0.4
    + COALESCE(ts_rank(to_tsvector('english', content), to_tsquery('english', $keywords), 32), 0) * 0.2
    + EXP(-0.02 * EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400) * 0.25
    + importance * 0.15
  ) AS hybrid_score
FROM memory_facts
WHERE user_id = $userId
  AND embedding IS NOT NULL
ORDER BY hybrid_score DESC
LIMIT 10;
```

The query is executed via Drizzle's `db.execute()` with parameterized values. Keywords are derived from the user's message (words > 2 chars, joined with `&` for AND semantics).

---

## Contextual Embeddings

Facts are not embedded as raw text. Before embedding, each fact gets a category-specific prefix to improve retrieval accuracy:

| Category | Prefix |
|----------|--------|
| `personal_info` | "Personal information about the user: " |
| `relationships` | "User relationship: " |
| `work` | "Work and career information: " |
| `health` | "Health information: " |
| `interests` | "User interest or hobby: " |
| `goals` | "User goal or aspiration: " |
| `emotional_patterns` | "Emotional pattern or tendency: " |

This is implemented in `apps/api/src/services/embedding.ts` via `addContextualPrefix()`. Facts use `inputType: "document"` when embedding, while queries use `inputType: "query"` (asymmetric search via Voyage AI).

---

## How Facts Are Extracted

Memory extraction runs in **real-time** via an async batching queue (`apps/api/src/services/memoryQueue.ts`), not as a nightly cron.

### Step 0: Signal Detection

Before enqueueing, `shouldExtract()` checks if messages contain extractable content. Trivial messages (greetings, single-word replies, "ok", "thanks") are skipped to avoid wasting AI calls.

### Step 1: Enqueue and Batch

After each chat exchange, the user/ally message pair is enqueued. The queue accumulates messages until either:
- **Batch threshold** — 4 message pairs accumulated, or
- **Time window** — 15 seconds elapsed since first message in batch

A safety-net cron (`flush_memory_queue`) runs every 5 minutes to flush any stuck batches.

### Step 2: Send to Claude for Extraction

The extraction logic in `apps/api/src/ai/extraction.ts` calls Claude with the prompt from `apps/api/src/ai/prompts.ts` (`EXTRACTION_SYSTEM_PROMPT`). Claude is instructed to:

1. Read through the batched messages
2. Identify any new facts, updates to existing facts, or changes in status
3. Return structured JSON with `facts`, `followups`, and `profileUpdates`
4. For each fact: `content`, `category`, `confidence`, `importance`, `updateType`, `entities`, `emotion`, `temporal`
5. Flag any unresolved emotional moments as pending follow-ups

### Step 3: Store Facts and Update Profile

- **New facts** (confidence >= 0.7): Inserted into `memory_facts` with contextual embeddings generated via Voyage AI
- **Updates/Corrections**: Handled by the merge logic in `apps/api/src/services/memory.ts` (`storeExtractedFacts`)
- **Follow-ups**: Added to `pending_followups` in the memory profile via `addFollowups`
- **Profile updates**: Applied to the `memory_profiles` JSONB via `updateProfile`

### Step 4: Contextual Embeddings

Each stored fact is embedded using Voyage AI (`voyage-4-lite`, 1024 dimensions) with a **category-specific contextual prefix** (see Contextual Embeddings section above). The vector is stored in the `embedding` column for hybrid retrieval.

### Retry Logic

Failed batches are retried up to 2 times with exponential backoff. Max 2 concurrent extraction batches to avoid overloading the AI API.

---

## How Memory Is Injected Into Conversations

When a user sends a message via the Elysia API (`apps/api/src/routes/chat.ts`), the AI layer builds context using a **3-tier memory system**:

```
[System Prompt - Ally's personality + tool instructions]
[Hot Memory - Structured profile, always loaded]
[Cold Memory - Retrieved facts via hybrid search with query expansion]
[Session Summaries - Rolling context from past sessions]
[Warm Memory - Current session messages]
[User's New Message]
```

The system prompt is wrapped with `cache_control: { type: "ephemeral" }` for Anthropic prompt caching, reducing token costs for the hot + cold memory block which changes infrequently within a session.

### Tier 1: Hot Memory

The structured memory profile (JSONB in `memory_profiles`) is always loaded. It includes:
- `personal_info`, `relationships`, `work`, `health`, `interests`, `goals`, `emotional_patterns`, `pending_followups`

Assembled by `apps/api/src/ai/prompts.ts` (`buildAllySystemPrompt`).

### Tier 2: Warm Memory (Session-Aware)

Warm memory is now **session-aware** rather than a flat "last N messages":

- **Session summaries** — Rolling summaries of the last 5 completed sessions (from `sessions_v2` table). These provide high-level context about past conversations without loading all messages.
- **Active session messages** — Up to 30 messages from the current session (detected by `services/session.ts`).

Session boundaries are detected automatically: a 30-minute gap between messages triggers a new session. When a session is closed, Claude generates a concise summary that captures key topics, emotional tone, and any unresolved threads.

### Tier 3: Cold Memory

Facts retrieved via **hybrid retrieval with query expansion** from `memory_facts`. The user's message is expanded into 2-3 queries, each searched in parallel; `retrieveRelevantFacts()` returns the top 8 deduplicated facts by hybrid score. These are injected as "Additional relevant memories" in the system prompt.

**Memory Context Block structure:**

```
Here is what you remember about {preferred_name}:

**About them:** {personal_info summary}

**People in their life:**
{formatted relationships list}

**Work:** {work summary}

**Active Goals:**
{formatted goals with status}

**Emotional Patterns:**
{stressors, coping mechanisms, sensitivities}

**Things to follow up on:**
{pending_followups, ordered by priority}

**Additional relevant memories:**
- [category] {content}  (from cold memory / hybrid retrieval)
```

---

## Context Window Management

The retrieval pipeline manages context size:

1. **Hot memory** is always included (profile size varies; typically compact)
2. **Cold memory** is capped at 8 facts per request (configurable `limit` in `retrieveRelevantFacts`)
3. **Warm memory**:
   - Session summaries: up to 5 recent sessions (~100-200 tokens each)
   - Active session messages: up to 30 messages
4. **Token budget**: Memory context is designed to stay within ~2000 tokens to leave room for conversation history, tool results, and response

The session windowing approach is key: instead of loading the entire conversation history (which could be thousands of messages), only the current session's messages + compressed summaries of past sessions are loaded. This keeps context tight while preserving continuity.

Hybrid retrieval with query expansion ensures that the 8 facts included are the most relevant: semantically similar across multiple query variants, keyword-matched, recent, and important.

---

## Privacy Considerations

### User Control

- Users can view everything Ally remembers about them via `GET /api/v1/memory/profile`
- Users can delete individual facts via `DELETE /api/v1/memory/facts/:id`
- Users can delete their entire memory profile via `DELETE /api/v1/memory/profile`
- Deletion is permanent and irreversible

### Data Handling

- Memory profiles are stored in the database, not in Claude's memory
- Each Claude API call is stateless -- Ally's "memory" is reconstructed from the stored profile every time
- Conversation data is retained according to the user's tier:
  - Free Trial: 7 days
  - Basic: 30 days
  - Pro: Unlimited
  - Premium: Unlimited
- Memory profiles are retained as long as the account exists, regardless of tier
- When a user deletes their account (handled by mobile team), the mobile team must call the memory deletion endpoint

### What Ally Never Stores

- Passwords or financial information
- Information the user explicitly asks Ally to forget
- Third-party information shared without consent (e.g., "my friend told me she's pregnant" -- Ally will acknowledge in conversation but not store the friend's personal information as a fact)

### Encryption

- Memory profiles are encrypted at rest in the database (handled by mobile team's DB configuration)
- All API communication is over HTTPS
- Memory data in transit stays on the server (Elysia backend is all-TypeScript; no cross-process transfer)

---

## Scaling Considerations

### Phase 1: PostgreSQL + pgvector (Current)

Current approach. Facts are stored in `memory_facts` with pgvector embeddings. Hybrid retrieval with query expansion runs multiple parallel SQL queries using HNSW (vector), GIN (full-text), and B-tree (user+category) indexes. Memory extraction is real-time via an async batching queue.

**Pros:**
- Single database, no separate vector store
- Hybrid scoring in one query
- Query expansion provides broader recall without extra infrastructure
- Contextual embeddings improve match quality
- Real-time extraction means memory is available within seconds, not next-day
- Good for thousands of users and hundreds of facts per user

**Cons:**
- HNSW index tuning may be needed at scale
- Query expansion multiplies DB queries (2-3x per retrieval)
- In-process memory queue does not survive server restarts

**Works well for:** Up to ~50,000 users, profiles with hundreds of facts

### Phase 2: Tune HNSW + Redis Caching + Graph DB

- Tune HNSW index parameters (`m`, `ef_construction`) for better recall/latency tradeoff
- Redis for: memory profile caching, session state caching, rate limiting, memory queue persistence
- Move to graph-based retrieval for relationship-aware memory (planned)
- Consider materialized views for common retrieval patterns

**When to migrate:** Query latency exceeds 100ms, or DB CPU from vector search becomes a bottleneck.

### Phase 3: Dedicated Vector DB (Qdrant)

Offload vector search to a dedicated store (e.g., Qdrant) while keeping PostgreSQL for metadata, full-text, and transactional data.

**How it would work:**
- Sync embeddings to Qdrant on fact insert/update
- Run vector search in Qdrant, join with PostgreSQL for importance/recency/full-text
- Or: use Qdrant's payload filtering for hybrid-like scoring

**When to migrate:** Millions of facts, or when pgvector limits are hit (e.g., index rebuild time, memory).
