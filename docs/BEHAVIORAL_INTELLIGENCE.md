# Behavioral Intelligence — Feature Spec

This document specifies the premium behavioral intelligence features planned for Ally. These features represent the core differentiator of the premium tier: automatic, zero-setup insight derived entirely from natural conversation.

**Status: Planned — not yet implemented**

The data infrastructure (memory facts, episodes, events, entity graph, weekly insights) is already in place. Behavioral intelligence is a product layer on top of it.

---

## The Core Insight

Most productivity and wellness apps fail for one reason: they require manual setup. Habit trackers need you to log habits. Goal apps need you to enter goals. Mood diaries need you to fill them in.

Ally's advantage: every conversation is already being analyzed. The data is a byproduct of the relationship, not a chore. Behavioral intelligence uses that data to give users things they didn't have to ask for.

Zero friction. Emerges from the relationship.

---

## Feature 1: Habit Detection

### What it does

Ally observes behavioral patterns from natural conversation, classifies them as potential habits, and tracks them without any explicit user setup.

**Example:**
- User mentions gym on Monday, Wednesday, Friday across three weeks
- Ally detects the pattern: "gym MWF" is a tracked habit candidate
- Ally surfaces this naturally: *"you've been pretty consistent with the gym this month — three times a week, right? Is that the plan?"*
- User confirms or corrects — this becomes a tracked habit
- When the user misses two Fridays: *"haven't heard about the gym lately — everything ok?"*

### Data sources

- `memory_episodes`: short-lived events mentioning the behavior
- `memory_facts`: semantic patterns like "exercises regularly" or "runs in the mornings"
- Entity graph: entity nodes of type "topic" for habit categories

### Detection algorithm

1. Scan episodes and facts for behavioral repetition signals (time-of-day + activity patterns)
2. Group by entity/activity type
3. If 3+ occurrences within 30 days with consistent frequency pattern → candidate habit
4. Ask for implicit confirmation in next relevant conversation
5. Store confirmed habits in a new `habits` table (planned schema below)

### Planned schema

```sql
habits
  id                UUID PRIMARY KEY
  user_id           TEXT REFERENCES users(id)
  name              TEXT             -- "gym 3x/week"
  description       TEXT             -- "gym sessions Monday, Wednesday, Friday"
  frequency         TEXT             -- "3x_weekly", "daily", "weekdays"
  status            TEXT             -- "active", "paused", "broken"
  streak_days       INTEGER          -- current consecutive days/units
  last_occurrence   DATE
  confirmed_at      TIMESTAMP        -- when user implicitly confirmed
  source_fact_ids   UUID[]           -- memory facts that triggered detection
  created_at        TIMESTAMP
```

### Tier gate

Premium only.

---

## Feature 2: Goal Scaffolding

### What it does

When the user states a goal, Ally doesn't just store it. It actively monitors progress mentions, builds a rough arc, and checks in when the conversation goes silent on that thread.

Goals are already stored in `MemoryProfile.goals` and the `memory_facts` table with `category: "goals"`. Goal scaffolding adds proactive monitoring and structured follow-through on top of existing goal storage.

**Example:**
- User: "I want to run a half marathon in June"
- Ally stores it as a `goals` fact and in `MemoryProfile.goals`
- Ally asks: *"awesome — do you have a training plan yet, or are you building one?"*
- 3 weeks later, user hasn't mentioned running: *"what's the training situation for June? haven't heard about it in a bit"*
- As June approaches, Ally builds context from past mentions and provides relevant check-ins

### Data sources

- `MemoryProfile.goals` — the canonical list of active goals
- `memory_facts` with `category: "goals"` — goal-related facts with progress notes
- `memory_episodes` — recent mentions of goal progress
- `memory_events` — goal-related milestones/deadlines

### Implementation additions needed

1. `daily_ping` job to be aware of goals with no recent episode mentions (>14 days silence)
2. New signal in `memoryQueue.ts`: goal-related messages trigger higher priority extraction
3. `goal_checkins` table for tracking when Ally last checked in on each goal

### Planned schema addition to `memory_events`

Goal scaffolding primarily uses the existing goals + events structure. New `goal_id` FK on memory_events would link milestones to goals:

```sql
-- Add to memory_events
goal_id   UUID REFERENCES habits(id)  -- nullable, links event to goal milestone
```

### Tier gate

Premium only. (Goal storage happens for all tiers; active scaffolding/monitoring is Premium-only.)

---

## Feature 3: AI-Set Goals (Differentiated Feature)

### What it does

This is the feature no other product does. Ally observes a recurring pattern the user hasn't explicitly named, surfaces the insight, and offers to focus on it together.

**Example:**
- Ally notices: user mentions feeling overwhelmed every Sunday for three consecutive weeks
- Conversation entry: *"hey, I've noticed Sundays keep being rough for you — this is the third week you've mentioned it. want to work on that? I can pay closer attention."*
- User agrees → Ally creates an AI-suggested focus area (a special goal type)
- From that point: Ally tracks Sunday mentions, notices deviations, checks in more attentively

This is genuinely unprecedented. The user didn't identify the problem. Ally did.

### Detection mechanism

1. Weekly insights job already analyzes mood trends — extend it to flag recurring patterns
2. Pattern detection: if the same theme/emotion appears in 3+ sessions within 30 days, trigger an AI-set goal candidate
3. Claude evaluates whether the pattern is actionable (not all patterns should become goals)
4. Surface to user in next daily ping or next conversation naturally

### Planned schema

```sql
ai_suggestions
  id              UUID PRIMARY KEY
  user_id         TEXT REFERENCES users(id)
  type            TEXT          -- "goal_suggestion", "habit_suggestion", "insight_observation"
  title           TEXT          -- "Sunday overwhelm pattern"
  description     TEXT          -- the Ally observation
  evidence        JSONB         -- episode/fact IDs that triggered it
  user_response   TEXT          -- "accepted", "dismissed", "snoozed"
  responded_at    TIMESTAMP
  created_at      TIMESTAMP
```

### Tier gate

Premium only.

---

## Feature 4: Mood Calendar

### What it does

A visual timeline of the user's emotional state, built automatically from episodic memory emotional tags and weekly insights. Not a mood tracker you fill in — something that emerges from what you've said.

**What users see:**
- A calendar heatmap (like GitHub activity graph) colored by emotional valence
- Tap a day → see the episodic memories from that day with their emotional tags
- Week-level view: mood trend annotation ("rough week around March 3 — that's when your manager conversation happened")
- Correlation annotations: "rough week correlated with project deadline mention"

### Data sources

- `memory_episodes`: short-lived memories with `emotion` field
- `weekly_insights`: `moodTrend` field, `topThemes`
- `memory_events`: completed events near emotional spikes

### API endpoint needed

```
GET /api/v1/profile/mood-calendar?weeks=12
```

Response:
```json
{
  "weeks": [
    {
      "weekOf": "2026-03-03",
      "moodTrend": "declining",
      "dominantEmotions": ["stressed", "overwhelmed"],
      "episodeCount": 7,
      "topTheme": "work deadline"
    }
  ]
}
```

### Tier gate

Premium only.

---

## Feature 5: Accountability Threads

### What it does

`set_reminder` elevated to a tracked feature. Ally holds the thread for commitments the user makes, and builds a model of their avoidance and resistance patterns over time.

**Example:**
- User: "I need to send that email to my manager this week"
- Ally (via `set_reminder`): creates a reminder
- Thursday: *"last Tuesday you said you'd send that email. did you? what got in the way?"*
- If the user keeps avoiding it: Ally notes the pattern — this is an avoidance signal
- Over time: Ally gets smarter about what to push vs. what to let breathe

### Data sources

- `set_reminder` tool calls (already implemented in `ai/tools.ts`)
- New `accountability_threads` table for tracking thread state
- `memory_facts` with `category: "emotional_patterns"` for avoidance pattern storage

### Planned schema

```sql
accountability_threads
  id              UUID PRIMARY KEY
  user_id         TEXT REFERENCES users(id)
  commitment      TEXT          -- "send email to manager"
  created_at      TIMESTAMP
  due_date        TIMESTAMP     -- when user said they'd do it
  checked_in_at   TIMESTAMP
  resolved_at     TIMESTAMP
  outcome         TEXT          -- "completed", "avoided", "rescheduled", "dropped"
  follow_up_count INTEGER       -- how many times Ally checked in
```

### Tier gate

Premium only.

---

## Implementation Phases

### Phase A: Foundation (next sprint)
- Habit detection algorithm in consolidation job
- Goal scaffolding signals in daily ping
- `habits` and `ai_suggestions` table migrations

### Phase B: AI-Set Goals + Mood Calendar
- Pattern detection in weekly insights job
- AI suggestion surfacing in proactive system
- Mood calendar API endpoint

### Phase C: Accountability Threads + Full Polish
- Accountability thread tracking
- Full premium UI in the "You" screen
- Push notifications for accountability check-ins

---

## Design Principles

**Zero friction** — none of these features require explicit user setup. They emerge from conversation.

**Observe, then ask** — Ally surfaces observations and asks permission before creating goals/habits. Never unilaterally decides the user has a problem. This principle also governs challenge mode in conversation (see below).

**Smart silence** — not every pattern needs a check-in. Ally builds a model of what the user wants to be held to vs. what they want space on. Challenge mode applies the same: name the pattern once, then respect their response.

**Transparent** — if the user asks "why are you checking in on this?", Ally can explain exactly which observations triggered it.

---

## Relationship to Conversation-Layer Features

These behavioral intelligence features are the *structured* layer on top of what already happens in natural conversation. They share the same underlying pattern detection, but operate on different surfaces:

### Challenge Mode (Conversational Layer)

When a stuck pattern appears repeatedly in session history, Ally names it directly in the flow of conversation — once, then drops it if deflected. This is available from session 7+ and requires no user setup.

See `docs/ALLY_PERSONALITY.md` → Being Honest for the full behavioral spec. This is the conversational precursor to AI-Set Goals (Feature 3 above): same observation, different interface. Challenge mode is the implicit nudge; AI-Set Goals is the explicit opt-in.

### Dependency Awareness (Anti-HER, Proactive Layer)

When a user's message frequency spikes significantly (5+ conversations per day for 3+ consecutive days), the proactive system surfaces a gentle check-in: "You've been talking to me a lot this week — everything good?"

This is handled in `apps/api/src/services/proactive.ts` (proactive_scan job) rather than the main chat prompt. The chat prompt carries a lighter version: when context signals high-frequency usage, Ally does not amplify it or offer unbounded availability.

The principle: Ally exists to make the user's real life better, not to replace it. Dependency awareness is the automated signal for when that boundary is at risk. See `docs/ALLY_PERSONALITY.md` → Real People Matter.
