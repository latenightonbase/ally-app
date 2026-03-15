# Future Iterations & Product Roadmap

This document tracks planned features, deferred work, and known technical debt. Items move from planned → in-progress → completed as they're built.

For the product vision and north star, see `docs/PRODUCT_VISION.md`.
For behavioral intelligence feature specs, see `docs/BEHAVIORAL_INTELLIGENCE.md`.
For memory system architecture, see `docs/MEMORY_ARCHITECTURE.md`.

---

## Roadmap

### Phase A: Behavioral Intelligence (Next Sprint)

These features use data that's already being collected. The memory infrastructure is in place — this is the product layer on top.

**Habit Detection** _(Premium)_
- [ ] Scan `memory_episodes` and `memory_facts` for behavioral repetition signals
- [ ] Detect frequency patterns across 30-day windows
- [ ] Surface candidates to user in natural conversation for implicit confirmation
- [ ] `habits` table migration (schema in `docs/BEHAVIORAL_INTELLIGENCE.md`)
- [ ] Integrate with `daily_ping` job for habit check-ins on deviation

**Goal Scaffolding** _(Pro + Premium)_
- [ ] `daily_ping` job to detect goals with no recent episode mentions (>14 day silence)
- [ ] Goal-related messages get higher-priority extraction signal
- [ ] `goal_checkins` tracking to avoid over-pinging

**AI-Set Goals** _(Premium)_
- [ ] Extend `weekly_insights` job to flag recurring negative patterns
- [ ] Claude evaluates whether pattern is actionable
- [ ] Surface suggestion in next daily ping or natural conversation moment
- [ ] `ai_suggestions` table migration

**Mood Calendar** _(Premium)_
- [ ] `GET /api/v1/profile/mood-calendar?weeks=12` endpoint
- [ ] Aggregate episode emotions by week
- [ ] Correlate mood dips with known events (proximity-based)

**Accountability Threads** _(Premium)_
- [ ] `accountability_threads` table migration
- [ ] Extend `set_reminder` tool to create thread records
- [ ] Check-in logic in `daily_ping` job
- [ ] Track outcome: completed / avoided / rescheduled

---

### Phase B: App Integrations

These add richer signal to the memory system without requiring user effort.

**Calendar Integration**
- [ ] Sync calendar events → `memory_events` directly (no extraction needed)
- [ ] `sourceType: 'calendar'`
- [ ] Surface in context injection (already handled by `getUpcomingEvents()`)

**Notes Integration**
- [ ] Lightweight extraction from notes content → `memory_facts`
- [ ] `sourceType: 'notes'`
- [ ] On-demand: only extract when note is explicitly shared with Ally

**Health Integration**
- [ ] Daily step count / sleep / workout summary → `memory_facts` with `category: 'health'`
- [ ] `sourceType: 'health'`

---

### Phase C: Polish & Trust Features

**Memory corrections on "You" screen**
- [ ] Allow users to edit or remove individual dynamic attributes from the You screen
- [ ] Allow users to correct relationship notes and goal status
- [ ] `PATCH /api/v1/profile/you/attribute/:key` to update a dynamic attribute
- [ ] Trust hygiene: if the user corrects something, mark it as `userVerified: true`

**Ally-generated chapter summaries** _(Premium)_
- [ ] Monthly AI-generated narrative summary of the user's arc
- [ ] Triggered by the consolidation job when sufficient episodic data exists
- [ ] Delivered as a push notification + available in briefing history

**Memory corrections flow**
- [ ] Users can flag a fact as wrong from the You screen
- [ ] Flagged facts are excluded from retrieval and marked in the DB

---

## Previously Implemented

### Product Layer
- [x] Dynamic profile attributes (`dynamicAttributes` in `MemoryProfile`)
  - Real-time extraction in chat via `EXTRACTION_SYSTEM_PROMPT`
  - Onboarding extraction via `ONBOARDING_COMPLETE_PROMPT`
  - Weekly promotion from high-importance facts via `DYNAMIC_PROMOTION_PROMPT` in `consolidation.ts`
  - Injected into every Claude system prompt via `buildAllySystemPrompt`
- [x] "You" screen API endpoint (`GET /api/v1/profile/you`)
  - Tiered response: Free (basic) vs Pro/Premium (full)
  - Includes: personalInfo, relationships, goals, upcomingEvents, emotionalPatterns, dynamicAttributes, recentEpisodes, completenessSignal
- [x] Weekly insights persisted to `weekly_insights` table
- [x] `GET /api/v1/insights/weekly` endpoint (Premium)
- [x] Contradiction detection UX: `GET /facts?includeSuperseeded=true` + `PATCH /facts/:factId/restore`

### Memory System — Phase 2
- [x] Sparse/keyword hybrid search: Qdrant text-index keyword retrieval merged with dense via RRF
- [x] Multi-hop graph traversal: `getEntityLinkedIds` upgraded to `*0..2` Cypher traversal
- [x] Entity coreference resolution: `upsertEntity` merges into existing node on normalized-name match
- [x] Qdrant payload importance sync: monthly decay job syncs updated importance values
- [x] Emotional context retrieval: LLM-based emotion detection (Claude Haiku), runs concurrently in retrieval
- [x] Contradiction detection: `supersedes` field on `ExtractedFact`

### Memory System — Phase 1
- [x] Memory tiering: semantic facts, episodic memories, future events
- [x] Entity extraction and graph storage (FalkorDB)
- [x] Three-stage hybrid retrieval (Qdrant dense + keyword + FalkorDB entity graph)
- [x] Weekly consolidation: episode reflection → semantic facts (Generative Agents pattern)
- [x] Dynamic profile promotion: high-importance facts → `dynamicAttributes`
- [x] Daily maintenance: event promotion, episode purge, importance decay
- [x] BullMQ queue with FalkorDB Redis backend
- [x] Context injection: upcoming events surfaced in every session
- [x] Memory type classification in extraction (semantic / episodic / event)

### API & Backend
- [x] Dynamic onboarding flow (`/onboarding/followup` + `/onboarding/complete`)
- [x] Better Auth sessions (replaced JWT)
- [x] Notifications utility (`services/notifications.ts`)
- [x] Weekly insights job with push notification
- [x] Daily ping job with rich context (followups + events + session summary)
- [x] Proactive re-engagement via event system (`services/events.ts`)
- [x] Briefing consolidation (`ensureBriefingForUser` in `ai/briefing.ts`)

---

## Known Technical Debt

- `apps/mobile/app/(tabs)/memory.tsx` — the Memory Vault tab still shows grouped text facts. Needs to be replaced with the "You" screen design specified in `docs/PRODUCT_VISION.md`. The API is ready; this is purely frontend work.
- Test database schema is not fully in sync with production (missing Phase 1 tables). Some integration tests may fail against the test DB. Use `bun run test:unit` as a reliable baseline.
- `consolidation.ts` uses `ANY(${episodeIds})` which is a raw SQL fragment — should be replaced with Drizzle's `inArray()` when migrating to a newer Drizzle version.
- Agent personality workstream (separate chat) — not yet integrated.

---

## Conversation Quality Roadmap

### Track 1 — Prompt Architecture (Implemented)

The following have been built into `apps/api/src/ai/prompts.ts`:

- [x] **Conversational modes framework** — six modes (Casual, Venting, Processing, Advice, Challenge, Crisis) with per-mode behavioral rules baked into the system prompt
- [x] **Challenge mode (Being Honest)** — memory-gated (7+ sessions), MI-informed back-off rule. Ally names stuck patterns once, then drops it if deflected
- [x] **Anti-HER directives (Real People Matter)** — real human amplification, the redirect move ("have you told [person] this?"), dependency-awareness at prompt level
- [x] **Adaptive interiority (Point of View)** — session-depth gated. Light texture sessions 1-7, defined perspective sessions 8-20, full interiority sessions 20+
- [x] **sessionCount threading** — `buildAllySystemPrompt` now receives session count from DB, passed from `buildSessionContext` → `generateReply` → prompt builder
- [x] **Model routing extended** — sessions 20+ always use quality model (Sonnet)

### Track 2 — Fine-Tuning Pipeline (Prerequisite: data collection)

Fine-tuning is the right eventual path but requires rated conversation data first. Do not fine-tune without it — fine-tuning on unrated data produces consistent mediocrity, not improvement.

**Step 1 — Implicit signal collection (in-progress)**
- [x] Structured conversation signal logging in `routes/chat.ts` — logs `session_depth`, `session_count`, `response_ms` per conversation turn
- [ ] Ship to a log aggregator (Datadog, Axiom, or similar) for querying
- [ ] Build a weekly signal report: which sessions had high `session_depth`? What's the typical `response_ms` by session count tier?

**Step 2 — Conversation rating rubric**
- [ ] Internal tool: monthly pull of 50 conversations, rate each on rubric defined in `docs/DPO_SCHEMA.md`
- [ ] Build rated pair dataset: `{ preferred_response, rejected_response, conversation_mode, session_count }`
- [ ] Target: 500+ rated pairs before fine-tuning

**Step 3 — Fine-tuning**
- [ ] At 500+ rated pairs: fine-tune Haiku for casual/quick exchanges (sessions < 8)
- [ ] Keep Sonnet for quality tier (sessions 20+, emotional, complex)
- [ ] Validate fine-tuned model against prompt-regression E2E tests before shipping

For the DPO dataset schema and rating rubric, see `docs/DPO_SCHEMA.md`.
