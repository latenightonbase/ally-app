# Ally

**The friend who never forgets.**

Ally is a personal AI companion that remembers everything you share, sends personalized morning briefings, and follows up on unresolved emotional moments. Built on Claude (`claude-sonnet-4-6`), Ally's conversations feel continuous and human -- not like talking to a blank slate every time.

---

## What This Repo Contains

| Component       | Directory   | Description                                              |
|-----------------|-------------|----------------------------------------------------------|
| Backend API     | `server/`   | Node.js/Express REST API for mobile app communication    |
| AI Layer        | `ai/`       | Python scripts for conversation, memory extraction, briefings |
| Cron Jobs       | `cron/`     | Scheduled tasks for nightly memory extraction and morning briefings |
| Documentation   | `docs/`     | Architecture, API docs, memory system, personality guide |

## What the Mobile Team Builds (Not in This Repo)

- iOS and Android app (UI, navigation, local state)
- Database (PostgreSQL schema, migrations, hosting)
- Authentication (signup, login, JWT issuance, token refresh)
- Stripe integration (subscription management, tier enforcement)
- Push notifications (APNs/FCM infrastructure and delivery)

---

## Architecture Overview

```
Mobile App  -->  Backend API (Node/Express)  -->  AI Layer (Python + Claude)
                       |                               |
                       v                               v
                 Database (PostgreSQL)          Cron Jobs (nightly extraction,
                 [Mobile Team]                  morning briefings)
```

The Node backend receives requests from the mobile app, validates JWTs, enforces rate limits by tier, and delegates AI work to Python scripts via child process spawning. All AI calls use `claude-sonnet-4-6`.

Full architecture details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## Pricing Tiers

| Tier                  | Price       | Key Features                                           |
|-----------------------|-------------|--------------------------------------------------------|
| Free Trial            | 14 days     | 20 messages/day, 7-day history                         |
| Basic                 | $9.99/mo    | 50 messages/day, 30-day history, 90-day memory         |
| Pro                   | $19.99/mo   | Unlimited messages, morning briefings, unlimited memory |
| Premium               | $49.99/mo   | Everything + proactive follow-ups, weekly insights      |

---

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.10+
- An Anthropic API key
- PostgreSQL connection string (from mobile team or local instance)

### 1. Clone and Install

```bash
git clone <repo-url> ally-app
cd ally-app

# Install Node dependencies
npm install

# Install Python dependencies
pip install -r ai/requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
ANTHROPIC_API_KEY=sk-ant-your-key-here
DATABASE_URL=postgres://user:pass@localhost:5432/ally
JWT_SECRET=your-jwt-secret-from-mobile-team
NODE_ENV=development
PORT=3000
PUSH_SERVICE_URL=http://localhost:4000/push
LOG_LEVEL=debug
```

### 3. Run the Backend

```bash
npm run dev
```

The API will be available at `http://localhost:3000`.

### 4. Test It

```bash
# Health check
curl http://localhost:3000/v1/api/health

# Chat (requires valid JWT)
curl -X POST http://localhost:3000/v1/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hey Ally, how are you?"}'
```

---

## Directory Structure

```
ally-app/
  server/                    # Node.js/Express backend
    index.js                 # App entry point
    routes/
      chat.js                # POST /api/chat
      onboarding.js          # POST /api/onboarding
      briefing.js            # GET /api/briefing
      memory.js              # GET/DELETE /api/memory/*
    middleware/
      auth.js                # JWT verification
      rateLimiter.js         # Tier-based rate limiting
      tierCheck.js           # Feature gating
    services/
      aibridge.js            # Python script spawner

  ai/                        # Python AI layer
    chat.py                  # Conversation handler
    extract_memories.py      # Nightly memory extraction
    generate_briefing.py     # Morning briefing generation
    onboarding.py            # Onboarding processor
    detect_followups.py      # Follow-up detection
    prompts/
      system_prompt.txt      # Ally personality prompt
      briefing_prompt.txt    # Briefing template
      extraction_prompt.txt  # Memory extraction instructions
    utils/
      claude_client.py       # Claude API wrapper (claude-sonnet-4-6)
      memory_loader.py       # Memory profile loader
      context_builder.py     # Prompt assembly
    requirements.txt         # Python dependencies

  cron/                      # Scheduled jobs
    scheduler.js             # Node-cron setup
    run_extraction.sh        # Memory extraction runner
    run_briefing.sh          # Briefing generation runner

  docs/                      # Documentation
    ARCHITECTURE.md          # System architecture
    API.md                   # Full API documentation
    MEMORY_SYSTEM.md         # Memory system deep dive
    ONBOARDING.md            # Onboarding flow and integration
    ALLY_PERSONALITY.md      # Voice, tone, and personality guide

  .env.example               # Environment variable template
  .gitignore
  package.json
  README.md
```

---

## API Overview

| Method | Endpoint                          | Description                        | Auth | Tier         |
|--------|-----------------------------------|------------------------------------|------|--------------|
| POST   | `/api/chat`                       | Send message, get Ally's response  | Yes  | All          |
| POST   | `/api/onboarding`                 | Submit onboarding answers          | Yes  | All          |
| GET    | `/api/briefing`                   | Get today's morning briefing       | Yes  | Pro+         |
| GET    | `/api/briefing/history`           | Past briefings                     | Yes  | Pro+         |
| GET    | `/api/memory/profile`             | View full memory profile           | Yes  | All          |
| DELETE | `/api/memory/profile`             | Delete all memory                  | Yes  | All          |
| GET    | `/api/memory/facts`               | List stored facts                  | Yes  | All          |
| DELETE | `/api/memory/facts/:id`           | Delete a specific fact             | Yes  | All          |
| GET    | `/api/conversations`              | List conversations                 | Yes  | All          |
| GET    | `/api/conversations/:id`          | Get conversation messages          | Yes  | All          |
| GET    | `/api/insights/weekly`            | Weekly emotional insights          | Yes  | Premium      |
| GET    | `/api/user/tier`                  | Check subscription tier and limits | Yes  | All          |
| POST   | `/api/webhooks/subscription`      | Subscription change webhook        | Webhook | N/A       |
| GET    | `/api/health`                     | Health check                       | No   | N/A          |

Full API documentation with request/response schemas: [docs/API.md](docs/API.md)

---

## Running Each Component

### Backend API (Development)

```bash
npm run dev          # Starts Express with nodemon
npm start            # Production start
npm test             # Run test suite
```

### AI Layer (Standalone Testing)

```bash
# Test chat
echo '{"user_id":"test","message":"Hello","conversation_id":"test-conv"}' | python3 ai/chat.py

# Test memory extraction
python3 ai/extract_memories.py --user-id test --date 2026-03-04

# Test briefing generation
python3 ai/generate_briefing.py --user-id test
```

### Cron Jobs

In development, cron jobs can be triggered manually:

```bash
# Run memory extraction for all users
node cron/scheduler.js --run extraction

# Run briefing generation for all users
node cron/scheduler.js --run briefing
```

In production, cron is managed by the scheduler:

```bash
node cron/scheduler.js    # Starts all scheduled jobs
```

---

## Environment Variables

| Variable             | Required | Description                                    |
|----------------------|----------|------------------------------------------------|
| `ANTHROPIC_API_KEY`  | Yes      | Claude API key for all AI calls                |
| `DATABASE_URL`       | Yes      | PostgreSQL connection string                   |
| `JWT_SECRET`         | Yes      | Shared secret for JWT verification             |
| `NODE_ENV`           | Yes      | `development` or `production`                  |
| `PORT`               | No       | Server port (default: 3000)                    |
| `PUSH_SERVICE_URL`   | No       | Push notification service URL (from mobile team) |
| `LOG_LEVEL`          | No       | Logging level (default: `info`)                |
| `WEBHOOK_SECRET`     | Yes      | Secret for webhook authentication              |

---

## Development Workflow

1. **Pick up a task** from the project board
2. **Create a feature branch** from `main`
3. **Develop and test locally** using the dev environment
4. **Write/update tests** for any new endpoints or AI behavior
5. **Open a PR** with a description of what changed and why
6. **Get review** from at least one other team member
7. **Merge to main** after approval

### Key Conventions

- All AI calls go through `ai/utils/claude_client.py` -- never call the Anthropic API directly from Node
- Every endpoint validates input before touching the AI layer
- Memory profile changes always go through the extraction pipeline, never written directly
- Tier checks happen at the middleware level, not inside route handlers

---

## Documentation Index

| Document                                           | What It Covers                                    |
|----------------------------------------------------|---------------------------------------------------|
| [Architecture](docs/ARCHITECTURE.md)               | System design, data flows, scaling plan           |
| [API Reference](docs/API.md)                       | Every endpoint with schemas and examples          |
| [Memory System](docs/MEMORY_SYSTEM.md)             | How Ally remembers, extracts, and recalls facts   |
| [Onboarding](docs/ONBOARDING.md)                   | The 5 questions, processing, mobile integration   |
| [Ally Personality](docs/ALLY_PERSONALITY.md)        | Voice, tone, example conversations, tier behavior |
