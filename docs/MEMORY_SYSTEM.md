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

## How Facts Are Extracted

Memory extraction runs as a nightly batch job at 2:00 AM. Here is the process:

### Step 1: Gather the Day's Conversations

For each user who had conversations that day, load all messages chronologically.

### Step 2: Send to Claude for Extraction

The extraction prompt instructs Claude (`claude-sonnet-4-6`) to:

1. Read through all messages from the day
2. Identify any new facts, updates to existing facts, or changes in status
3. Return structured JSON matching the memory profile schema
4. Flag any unresolved emotional moments as pending follow-ups

**Extraction prompt (simplified):**

```
You are a memory extraction system for Ally, a personal AI companion.

Given the following conversation(s) from today, extract any new or updated
facts about the user. Return ONLY facts that are explicitly stated or
strongly implied. Do not infer or assume.

Categories: personal_info, relationships, work, health, interests, goals,
emotional_patterns

For each fact, provide:
- category
- content (the fact itself)
- confidence (0.0-1.0, how certain you are this is accurate)
- update_type: "new" | "update" | "correction"

Also identify any unresolved emotional moments that Ally should follow up on.

Current memory profile:
{existing_profile}

Today's conversations:
{messages}
```

### Step 3: Merge Into Existing Profile

The merge logic follows these rules:

- **New facts** (confidence >= 0.7): Added to the appropriate category
- **Updates** (confidence >= 0.7): Replace or augment the existing fact
- **Corrections**: User explicitly corrected something Ally believed. The old fact is replaced.
- **Low confidence facts** (< 0.7): Stored in a staging area, confirmed on next mention
- **Contradictions**: If a new fact contradicts an existing one, flag for clarification rather than silently overwriting

### Step 4: Update Follow-ups

- New emotional moments are added to `pending_followups`
- Follow-ups that were addressed in today's conversations are marked `resolved: true`
- Resolved follow-ups older than 30 days are archived

---

## How Memory Is Injected Into Conversations

When a user sends a message, the AI layer builds the full context for Claude:

```
[System Prompt - Ally's personality]
[Memory Context Block]
[Recent Conversation History]
[User's New Message]
```

The **Memory Context Block** is assembled by `ai/utils/context_builder.py`:

```
Here is what you remember about {preferred_name}:

**About them:** {personal_info summary}

**People in their life:**
{formatted relationships list}

**Work:** {work summary}

**Health & Wellness:** {health summary}

**Interests:** {interests list}

**Active Goals:**
{formatted goals with status}

**Emotional Patterns:**
{stressors, coping mechanisms, sensitivities}

**Things to follow up on:**
{pending_followups, ordered by priority}
```

### Context Window Management

The memory profile is injected in full for users with smaller profiles. For users with large profiles (after months of use), the system applies relevance filtering:

1. **Always include:** `personal_info`, `pending_followups`, active `goals`
2. **Include if relevant:** Facts from categories that match keywords in the current message (e.g., if the user mentions "work," include the full `work` section)
3. **Summarize:** Categories not relevant to the current conversation are condensed to one-line summaries
4. **Token budget:** Memory context is capped at 2000 tokens to leave room for conversation history and response

---

## Privacy Considerations

### User Control

- Users can view everything Ally remembers about them via `GET /api/memory/profile`
- Users can delete individual facts via `DELETE /api/memory/facts/:id`
- Users can delete their entire memory profile via `DELETE /api/memory/profile`
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
- Memory data in transit between Node backend and Python AI layer stays on localhost (never leaves the server)

---

## Scaling Considerations

### Phase 1: File-Based / Single JSON Document (MVP)

Current approach. Each user's memory profile is a single JSON document stored in a `JSONB` column in PostgreSQL.

**Pros:**
- Simple to implement and query
- Easy to load the full profile in one read
- PostgreSQL JSONB supports indexing for specific fields

**Cons:**
- Full profile must be loaded every time (no partial reads)
- Large profiles may slow down context building
- No semantic search capability

**Works well for:** Up to ~10,000 users, profiles under 50KB

### Phase 2: Structured Tables

Split the memory profile into normalized tables:

```
memory_facts
  id          UUID
  user_id     UUID
  category    TEXT
  content     TEXT
  confidence  FLOAT
  source_date DATE
  metadata    JSONB
  created_at  TIMESTAMP
  updated_at  TIMESTAMP
```

**Pros:**
- Query individual facts efficiently
- Category-level filtering without loading full profile
- Better for analytics and reporting

**When to migrate:** Profile sizes regularly exceed 50KB, or you need category-level queries for features like the weekly insights report.

### Phase 3: Vector Database

Add a vector store (e.g., Pinecone, pgvector) for semantic memory retrieval.

**How it works:**
- Each fact is embedded and stored as a vector
- When the user sends a message, the message is embedded and the most semantically relevant facts are retrieved
- Replaces keyword-based relevance filtering with true semantic matching

**When to migrate:** Users have 500+ facts and the keyword-based relevance filtering starts missing important context, or when response quality degrades due to context window limitations.
