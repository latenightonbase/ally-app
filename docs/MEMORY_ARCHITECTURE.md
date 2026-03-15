# Ally Memory Architecture

> Living document — iterate as the system evolves. Last updated: March 2026.

## Overview

Ally's memory system is designed around a core insight from cognitive science: **memory is not storage, it's transformation**. Raw conversations are distilled through multiple layers into increasingly durable, queryable knowledge. No single database handles all concerns — each tier is optimized for its specific retrieval pattern.

## Infrastructure

| Service | Role | What lives here |
|---------|------|----------------|
| **Neon Postgres** | Relational source of truth | Users, conversations, messages, sessions, memory metadata (content + scores), events |
| **Qdrant Cloud** | Vector store | Dense embeddings for `memory_facts` and `memory_episodes`, payload-filtered search |
| **FalkorDB Cloud** | Graph DB + Queue backend | Entity nodes, relationship edges; Redis protocol used by BullMQ for extraction queue |

Postgres holds authoritative content. Qdrant holds search indexes. FalkorDB holds the relationship graph. All share a common `id` (UUID) primary key so records can be enriched from Postgres after retrieval.

## Memory Tiers

### Tier 0: Working Memory (context window)
The current conversation turn. Managed by the LLM context limit, not persisted separately. The active session messages serve this role.

### Tier 1: Hot (Identity Profile)
- **Storage**: `memory_profiles` table in Postgres (JSONB)
- **Always loaded**: Yes — included in every Claude system prompt
- **Size budget**: ~500 tokens
- **TTL**: Permanent
- **Contains**: Preferred name, location, job, key relationships, active goals, emotional patterns, pending followups

### Tier 2: Warm (Session Context)
- **Storage**: `sessions_v2` table in Postgres
- **Loaded**: Last 5 session summaries
- **TTL**: Kept indefinitely (used for briefings and proactive messaging)
- **Contains**: Claude-generated 2–3 sentence summaries of each conversation session

### Tier 3: Cold (Semantic Facts)
- **Storage**: `memory_facts` in Postgres + embeddings in Qdrant
- **Retrieved**: Via hybrid search (dense vector + recency + importance reranking)
- **TTL**: Long-lived — decays after 90 days of no access (15%/month importance reduction)
- **Contains**: Durable patterns, stable traits, habits — things that remain true for weeks/months
- **Examples**: "Struggles with gym consistency", "Works as a software engineer at Acme"

### Tier 4: Episodic (Short-lived Events)
- **Storage**: `memory_episodes` in Postgres + embeddings in Qdrant
- **Retrieved**: Via same hybrid search as semantic facts, with higher recency weight
- **TTL**: 7 days (importance < 0.5), 14 days (0.5–0.7), 30 days (0.7+)
- **Lifecycle**: Either consolidates into a semantic fact (via weekly reflection job) or expires
- **Examples**: "Had a rough gym session this week", "Got into an argument with Sarah"

### Tier 5: Events (Future-dated)
- **Storage**: `memory_events` in Postgres (no vectors — date-based, not semantic)
- **Retrieved**: Proactively injected into every context build if within next 7 days
- **TTL**: Expires day after event date, then promoted to an episodic memory
- **Examples**: "Job interview at Stripe on March 20", "Doctor appointment next Thursday"

### Tier 6: Entity Graph
- **Storage**: FalkorDB (nodes + edges in Cypher graph)
- **Retrieved**: Entity names extracted from query → graph lookup → linked fact/episode IDs
- **TTL**: Permanent (entities persist, their linked IDs update over time)
- **Contains**: People, places, organizations, topics with their relationships
- **Enables**: "What do I know about Sarah?" → traverse all Sarah-linked facts

## Data Flow

### Write Path (per conversation turn)
```
User message → shouldExtract() gate
                 ↓ (if signal detected)
             BullMQ job enqueued (via FalkorDB Redis endpoint)
                 ↓ (worker processes)
             Claude extraction call
                 ↓
         ┌─────────────────────┐
         │ Classify by memoryType │
         └─────────────────────┘
              ↙        ↓        ↘
        semantic   episodic    event
           ↓           ↓          ↓
    memory_facts  memory_episodes  memory_events
    + Qdrant      + Qdrant         (Postgres only)
         ↓
    Entity extraction → FalkorDB graph
```

### Read Path (per chat message)
```
User message
    ↓
detectEmotionFromQuery()  →  emotion label (optional, e.g. "anxious")
    ↓
buildSessionContext()
    ├── Hot profile (Postgres: memory_profiles)
    ├── Upcoming events next 7 days (Postgres: memory_events)
    └── Last 5 session summaries (Postgres: sessions_v2)

retrieveRelevantFacts()
    ├── Stage 1A: Qdrant dense vector search → top-20 IDs       ─╮
    ├── Stage 1B: Qdrant keyword text search → top-20 IDs       ─┤ mergeWithRRF → top-30 IDs
    └── Stage 2:  FalkorDB *0..2 entity graph lookup → linked IDs ─╯
         ↓
    Batch fetch content from Postgres by IDs
         ↓
    Rerank: semantic × 0.5 + recency × 0.3 + importance × 0.2 + emotion boost × 0.08
         ↓
    Top-15 injected into Claude system prompt
```

Stage 1A and 1B run in parallel after the query embedding is computed. RRF (k=60) promotes results that appear in both the dense and keyword result sets, improving recall for keyword-heavy queries (names, specific facts) without sacrificing semantic match quality.

## Scheduled Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| `flush_memory_queue` | Every 5 min | Flush any pending extraction batches to BullMQ |
| `memory_maintenance` | Daily 2am | Promote expired events → episodes; purge stale episodes |
| `memory_consolidation` | Sunday 3am | Reflection: cluster related episodes → semantic facts (Generative Agents pattern) |
| `daily_ping` | Every minute | Check and send daily briefings in user's timezone |
| `weekly_insights` | Sunday 8pm | Emotional week summary for premium users |
| `proactive_scan` | Every 30 min | Scan for inactive users, emit re-engagement events |

## Consolidation (Reflection Pipeline)

Inspired by the Generative Agents (Park et al., Stanford 2023) reflection mechanism.

Weekly, per user:
1. Find `memory_episodes` older than 7 days, not yet consolidated, grouped by shared entity
2. For clusters of 3+ related episodes: call Claude — *"Given these observations, what are 1–3 durable insights about this person's patterns?"*
3. Store insights as `memory_facts` with `importance: 0.7–0.95` and `consolidatedFrom: [episodeIds]`
4. Mark source episodes as `consolidatedAt` (they expire on schedule but are no longer candidates for re-consolidation)

This is how "had a bad gym day (×4 this month)" becomes "struggles with gym motivation consistently".

## Entity Graph Schema (FalkorDB)

```cypher
// Entity node
(:Entity {
  id: "userId:normalizedName",
  userId: string,
  type: "person|place|org|topic|goal",
  name: string,
  normalizedName: string,
  description: string | null,
  aliases: string[],
  factIds: string[],     // IDs of semantic facts involving this entity
  episodeIds: string[],  // IDs of episodes involving this entity
  createdAt: ISO string
})

// Relationship edge
(:Entity)-[:RELATED_TO {
  relationType: string,  // e.g. "sister_of", "works_at", "friend_of"
  weight: float,
  context: string | null,
  userId: string,
  updatedAt: ISO string
}]->(:Entity)
```

## Memory Decay

Semantic facts decay if not accessed:
- Monthly check (1st of each month): `importance *= 0.85` for facts with `lastAccessedAt > 90 days ago`
- Minimum importance floor: 0.05 (facts are never fully zeroed)
- Accessed facts get a +0.02 importance bump (`touchFacts()` after retrieval)

This creates a usage-frequency signal: frequently relevant facts stay important; stale facts fade.

## Contradiction Resolution

When extraction returns a fact with `supersedes: "existing fact content"`:
1. Search Postgres for the existing fact by content match
2. Set `supersededBy = newFactId` on the old fact
3. Delete the old fact from Qdrant index
4. New fact is indexed normally

Superseded facts are excluded from all retrieval queries (`WHERE superseded_by IS NULL`).

## Adding Integrations (Phase 2)

Every integration should:
1. Route structured data (calendar events) → `memory_events` directly (no extraction needed)
2. Route unstructured content (notes) → lightweight extraction pipeline → `memory_facts`
3. Set `sourceType: 'calendar' | 'notes' | 'health'` for audit trail
4. Reuse the same Qdrant collection and FalkorDB graph — no new retrieval paths

## Environment Variables Required

```
# Postgres (existing)
DATABASE_URL=

# Qdrant Cloud
QDRANT_URL=https://xxx.qdrant.io
QDRANT_API_KEY=

# FalkorDB Cloud (graph + queue backend)
FALKORDB_URL=rediss://default:password@host:6380

# Fallback: separate Redis for BullMQ queue only
REDIS_URL=redis://...  # Optional; FALKORDB_URL is used if not set
```

## Provisioning Qdrant

On first deploy, call `ensureCollection()` from `services/vectorStore.ts`. This is idempotent and creates the `ally_memories` collection with proper indexes if it doesn't exist. Recommended: call during server startup in `index.ts`.

After any schema migration that removes the `embedding` column from `memory_facts`, run the backfill script to re-embed existing facts into Qdrant:

```bash
bun run scripts/backfill-qdrant.ts
```

## Known Limitations & Future Work

- **True BM25 sparse vectors**: Currently using Qdrant's content text index + RRF for keyword hybrid search. For higher-precision sparse retrieval, Qdrant's named-vector API with a SPLADE/BM25 encoder (requires a TypeScript-native sparse encoder library) could replace the current Stage 1B approach.
- **Emotion detection cost**: Current approach calls Claude Haiku with `maxTokens=5` per retrieval. For very high-throughput deployments, batching emotion classification or caching results per conversation turn could reduce API calls.
