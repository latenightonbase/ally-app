# Ally Architecture

## Overview

Ally is a personal AI companion that remembers everything users share, sends personalized morning briefings, and follows up on unresolved emotional moments. This document describes the full system architecture.

```
                          +--------------------+
                          |   Mobile App       |
                          |  (iOS / Android)   |
                          |  [Mobile Team]     |
                          +--------+-----------+
                                   |
                                   | HTTPS / JWT
                                   |
                          +--------v-----------+
                          |   Backend API      |
                          |  (Node / Express)  |
                          |  [This Repo]       |
                          +--------+-----------+
                                   |
                    +--------------+--------------+
                    |              |               |
           +-------v---+  +------v------+  +-----v-------+
           | AI Layer   |  | Cron Jobs   |  | Database    |
           | (Python +  |  | (Node +     |  | (PostgreSQL)|
           |  Claude)   |  |  Python)    |  | [Mobile     |
           | [This Repo]|  | [This Repo] |  |  Team]      |
           +------------+  +-------------+  +-------------+
```

## Responsibility Split

### This Repo Contains

| Component       | Tech Stack      | Purpose                                                  |
|-----------------|-----------------|----------------------------------------------------------|
| Backend API     | Node.js/Express | REST endpoints for chat, onboarding, memory, briefings   |
| AI Layer        | Python + Claude | Conversation handling, memory extraction, briefing gen    |
| Cron Jobs       | Node + Python   | Nightly memory extraction, morning briefing generation   |
| Documentation   | Markdown        | Architecture, API docs, memory system, personality guide |

### Mobile Team Builds

| Component          | Purpose                                                  |
|--------------------|----------------------------------------------------------|
| iOS/Android App    | UI, local state, push notification handling              |
| Database           | PostgreSQL schema, migrations, hosting                   |
| Authentication     | JWT issuance, user signup/login, token refresh           |
| Stripe Integration | Subscription management, tier enforcement                |
| Push Notifications | APNs/FCM integration, delivery infrastructure           |

---

## Component Breakdown

### 1. Backend API (Node/Express)

The central REST API that the mobile app communicates with. Handles request validation, authentication verification, tier enforcement, and routes work to the AI layer.

**Key responsibilities:**
- Validate incoming JWTs (issued by the mobile team's auth service)
- Enforce rate limits per tier
- Route chat messages to the AI layer
- Serve memory profiles and briefings from storage
- Expose onboarding endpoints

**Directory:** `server/`

```
server/
  index.js              # Express app entry point
  routes/
    chat.js             # POST /api/chat
    onboarding.js       # POST /api/onboarding
    briefing.js         # GET /api/briefing
    memory.js           # GET /api/memory/profile
  middleware/
    auth.js             # JWT verification
    rateLimiter.js       # Tier-based rate limiting
    tierCheck.js         # Feature gating by subscription tier
  services/
    aibridge.js          # Spawns Python AI scripts
```

### 2. AI Layer (Python + Claude)

All AI logic lives in Python scripts that the Node backend invokes via child processes. Every AI call uses `claude-sonnet-4-6`.

**Key responsibilities:**
- Process chat messages with full memory context
- Extract facts from conversations (nightly batch job)
- Generate personalized morning briefings
- Process onboarding answers into initial memory profiles
- Detect emotional patterns and flag follow-up opportunities

**Directory:** `ai/`

```
ai/
  chat.py               # Handle a single chat turn
  extract_memories.py    # Nightly memory extraction from conversations
  generate_briefing.py   # Morning briefing generation
  onboarding.py          # Process onboarding answers
  prompts/
    system_prompt.txt    # Ally's core personality prompt
    briefing_prompt.txt  # Briefing generation template
    extraction_prompt.txt # Memory extraction instructions
  utils/
    claude_client.py     # Wrapper around Claude API (claude-sonnet-4-6)
    memory_loader.py     # Load and format memory profile for context
    context_builder.py   # Assemble full prompt with memory + history
```

### 3. Cron Jobs

Scheduled tasks that run outside the request/response cycle.

| Job                    | Schedule       | Script                      | Purpose                                         |
|------------------------|----------------|-----------------------------|-------------------------------------------------|
| Memory Extraction      | 2:00 AM daily  | `ai/extract_memories.py`    | Scan day's conversations, extract new facts      |
| Morning Briefing       | 5:00 AM daily  | `ai/generate_briefing.py`   | Generate personalized briefing per user           |
| Follow-up Detection    | 3:00 AM daily  | `ai/detect_followups.py`    | Flag unresolved emotional moments for follow-up   |

**Directory:** `cron/`

```
cron/
  scheduler.js          # Node-cron setup
  run_extraction.sh     # Shell wrapper for memory extraction
  run_briefing.sh       # Shell wrapper for briefing generation
```

### 4. Database (Mobile Team)

The database is owned and hosted by the mobile team. This repo interacts with it via environment variables for the connection string.

**Expected schema (for reference):**

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
  created_at      TIMESTAMP

messages
  id              UUID PRIMARY KEY
  conversation_id UUID REFERENCES conversations(id)
  role            ENUM('user', 'ally')
  content         TEXT
  created_at      TIMESTAMP

memory_profiles
  user_id         UUID PRIMARY KEY REFERENCES users(id)
  profile_json    JSONB
  updated_at      TIMESTAMP

briefings
  id              UUID PRIMARY KEY
  user_id         UUID REFERENCES users(id)
  content         TEXT
  delivered       BOOLEAN DEFAULT FALSE
  created_at      TIMESTAMP
```

---

## Data Flows

### Chat Message Flow

```
1. User sends message via mobile app
2. Mobile app sends POST /api/chat with JWT + message
3. Backend validates JWT, checks rate limit for user's tier
4. Backend calls ai/chat.py via child process, passing:
   - user_id
   - message text
   - conversation_id
5. chat.py:
   a. Loads user's memory profile from DB
   b. Loads recent conversation history
   c. Builds full context (system prompt + memory + history + new message)
   d. Calls Claude claude-sonnet-4-6
   e. Returns Ally's response
6. Backend stores both messages in DB
7. Backend returns Ally's response to mobile app
```

### Morning Briefing Flow

```
1. Cron fires at 5:00 AM (user's local timezone)
2. For each user with briefings enabled (Pro + Premium):
   a. Load user's memory profile
   b. Load any pending follow-ups
   c. Check calendar/weather APIs if connected
   d. Call Claude claude-sonnet-4-6 with briefing prompt + context
   e. Store generated briefing in DB
   f. Trigger push notification via mobile team's push service
```

### Nightly Memory Extraction Flow

```
1. Cron fires at 2:00 AM
2. For each user with conversations today:
   a. Load all messages from the day
   b. Load existing memory profile
   c. Call Claude claude-sonnet-4-6 with extraction prompt + messages
   d. Claude returns structured JSON of new/updated facts
   e. Merge new facts into existing memory profile
   f. Save updated profile to DB
```

### Onboarding Flow

```
1. User completes 5 onboarding questions in mobile app
2. Mobile app sends POST /api/onboarding with answers
3. Backend calls ai/onboarding.py with answers
4. onboarding.py:
   a. Calls Claude claude-sonnet-4-6 to process answers into structured memory
   b. Creates initial memory profile
   c. Generates Ally's first personalized greeting
5. Backend stores memory profile in DB
6. Backend returns greeting to mobile app
```

---

## How Node Bridges to Python

The Node backend spawns Python scripts as child processes using Node's `child_process.execFile`. Communication happens via stdin/stdout with JSON.

```javascript
// server/services/aibridge.js (simplified)
const { execFile } = require('child_process');

function callAI(script, input) {
  return new Promise((resolve, reject) => {
    const proc = execFile('python3', [`ai/${script}`], {
      timeout: 30000,
      env: { ...process.env }
    });

    let stdout = '';
    proc.stdin.write(JSON.stringify(input));
    proc.stdin.end();

    proc.stdout.on('data', (data) => { stdout += data; });
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`AI script exited with code ${code}`));
      else resolve(JSON.parse(stdout));
    });
  });
}
```

Python scripts read from stdin and write JSON to stdout:

```python
# ai/chat.py (simplified)
import sys
import json

input_data = json.loads(sys.stdin.read())
# ... process with Claude ...
print(json.dumps({"response": ally_response}))
```

This approach keeps the AI layer cleanly separated, allows independent Python dependency management, and avoids the complexity of running a second HTTP server.

---

## Multi-Tenant Isolation

Every request is scoped to a single user via their JWT. The isolation model:

- **Data isolation:** All DB queries are filtered by `user_id`. There is no cross-user data access.
- **Memory isolation:** Each user has their own memory profile document. Memory extraction and briefing generation are per-user.
- **Rate limiting:** Tracked per `user_id`, enforced per tier.
- **AI context:** Each AI call receives only the requesting user's data. No shared context between users.
- **Cron jobs:** Process users independently. One user's failure does not block others.

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
| `ANTHROPIC_API_KEY`  | Claude API authentication                  | `sk-ant-...`                     |
| `DATABASE_URL`       | PostgreSQL connection string               | `postgres://user:pass@host/db`   |
| `JWT_SECRET`         | Shared secret for JWT verification         | (from mobile team)               |
| `NODE_ENV`           | Environment flag                           | `development` / `production`     |
| `PORT`               | Express server port                        | `3000`                           |
| `PUSH_SERVICE_URL`   | Mobile team's push notification endpoint   | `https://push.example.com`       |
| `LOG_LEVEL`          | Logging verbosity                          | `info` / `debug`                 |

---

## Scaling Considerations

**Phase 1 (MVP, <1000 users):**
- Single Node process
- Memory profiles stored as JSON in PostgreSQL
- Python scripts spawned per-request
- Cron jobs run sequentially

**Phase 2 (1000-10,000 users):**
- Add Redis for rate limiting and session caching
- Queue AI requests through Bull/BullMQ
- Run Python AI layer as a persistent FastAPI service instead of spawning per-request
- Parallelize cron jobs

**Phase 3 (10,000+ users):**
- Horizontal scaling behind a load balancer
- Dedicated AI service cluster
- Move memory profiles to a vector database for semantic search
- Shard cron jobs across workers
- Add CDN for static briefing assets
