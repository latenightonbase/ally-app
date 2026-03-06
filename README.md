# Ally — Personal AI Companion

Ally is a personal AI companion that remembers what you share, sends personalized morning briefings, and follows up on unresolved emotional moments.

## Architecture

```
ally-app/
├── apps/
│   ├── mobile/          Expo / React Native (iOS + Android)
│   └── api/             Elysia + Bun backend (TypeScript)
├── packages/
│   ├── shared/          Shared types, schemas, constants
│   └── tsconfig/        Shared TypeScript configurations
├── docs/                Architecture, API, memory system docs
└── _legacy/             Previous Node/Express + Python implementation
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun |
| Monorepo | Turborepo |
| Frontend | Expo 55, React Native 0.83, NativeWind, Zustand |
| Backend | Elysia (Bun-native), TypeScript |
| Database | PostgreSQL + pgvector (Neon) |
| ORM | Drizzle |
| AI | Claude claude-sonnet-4-6 (Anthropic SDK) |
| Embeddings | Voyage AI voyage-4-lite |
| Validation | TypeBox (Elysia built-in) + Zod (shared schemas) |
| Auth | JWT verification (tokens issued by mobile team) |

### Memory System

Ally uses a **tiered memory architecture** with **hybrid retrieval**:

- **Hot Memory** — Structured JSONB profile (always loaded): name, relationships, goals, emotional patterns
- **Warm Memory** — Recent conversation history (last N messages)
- **Cold Memory** — Extracted facts with vector embeddings, retrieved via hybrid search combining semantic similarity, full-text matching, recency decay, and importance scoring

### Background Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| Nightly Extraction | 11 PM daily | Extract facts from today's conversations |
| Daily Briefings | 5 AM daily | Generate personalized morning briefings (Pro+) |
| Weekly Insights | Sunday 8 PM | Emotional week summary (Premium) |
| Re-engagement | 6 PM daily | Check-in with inactive users |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) >= 1.2
- PostgreSQL with pgvector extension (or [Neon](https://neon.tech) account)
- Anthropic API key
- Voyage AI API key

### Setup

```bash
# Install dependencies
bun install

# Copy environment variables
cp apps/api/.env.example apps/api/.env
# Edit .env with your credentials

# Push database schema
cd apps/api && bun run db:push

# Start development
bun run dev
```

### Commands

```bash
bun run dev        # Start all apps in development
bun run build      # Build all packages
bun run typecheck  # Type-check all packages
bun run lint       # Lint all packages
```

### API Development

```bash
cd apps/api
bun run dev        # Elysia with hot reload on :3000
bun run db:studio  # Drizzle Studio (database UI)
bun run db:generate # Generate migration from schema changes
bun run db:migrate  # Run pending migrations
```

### Mobile Development

```bash
cd apps/mobile
bun run dev        # Expo dev server
bun run ios        # Run on iOS simulator
bun run android    # Run on Android emulator
```
