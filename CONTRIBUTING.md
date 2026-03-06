# Contributing to Ally

## Prerequisites

- [Bun](https://bun.sh) >= 1.2
- PostgreSQL with pgvector (or a [Neon](https://neon.tech) account)

## Setup

```bash
bun install
cp apps/api/.env.example apps/api/.env
# Fill in your credentials in apps/api/.env
```

## Development

```bash
bun run dev              # Start all apps (Turborepo)
cd apps/api && bun run dev   # API only (with hot reload)
cd apps/mobile && bun run dev  # Mobile only (Expo)
```

## Project Structure

| Directory | Purpose |
|-----------|---------|
| `apps/api/` | Elysia backend — routes, middleware, AI layer, jobs, DB |
| `apps/mobile/` | Expo React Native frontend |
| `packages/shared/` | Shared types, Zod schemas, constants |
| `packages/tsconfig/` | Shared TypeScript configurations |
| `docs/` | Architecture and product documentation |
| `_legacy/` | Old implementation (reference only, do not modify) |

## Code Standards

### TypeScript

- Strict mode enabled across all packages
- Run `tsc --noEmit` before submitting changes to `apps/api/`
- No `any` unless absolutely necessary — use `unknown` and narrow
- ESM only — `import`/`export`, never `require`

### Naming

- `camelCase` for variables, functions, file names
- `PascalCase` for types, interfaces, classes, React components
- `SCREAMING_SNAKE_CASE` for constants

### Code Organization

- **Route handlers should be thin.** Extract business logic to `services/` or `ai/`.
- **Types shared across packages** go in `packages/shared/src/types/`, not duplicated.
- **AI prompts** are centralized in `apps/api/src/ai/prompts.ts`.
- **Database queries** use Drizzle ORM. Raw SQL only for pgvector operations.

### Comments

- Do NOT add comments that narrate what code does ("// Import the module", "// Return the result")
- DO comment non-obvious intent, constraints, trade-offs, or workarounds
- DO add JSDoc for public-facing service functions

### Dependencies

- Use `bun add` to add dependencies (never `npm install`)
- Prefer Bun/Elysia builtins over third-party packages
- Internal packages use `workspace:*` version specifier

## Database

```bash
cd apps/api
bun run db:push       # Push schema to DB (dev)
bun run db:generate   # Generate migration from schema changes
bun run db:migrate    # Run pending migrations
bun run db:studio     # Open Drizzle Studio (database UI)
```

Schema lives in `apps/api/src/db/schema.ts`. After modifying it, generate and run a migration.

## Testing

The backend has a three-tier test suite using `bun:test`.

### Test Tiers

| Tier | Command | What | Speed | When |
|------|---------|------|-------|------|
| Unit | `bun run test:unit` | Middleware, services, AI layer (all mocked) | ~2s | Every change |
| Integration | `bun run test:integration` | Full HTTP lifecycle with real DB (AI mocked) | ~15s | Every change |
| E2E | `bun run test:e2e` | Real Claude + Voyage + pgvector (nothing mocked) | ~60s | Before releases, after prompt changes |

```bash
cd apps/api
bun run test               # Unit + integration
bun run test:unit          # Unit only (no DB)
bun run test:integration   # Integration only (requires .env.test)
bun run test:coverage      # With coverage report
bun run test:e2e           # E2E (requires .env.test.live with real API keys)
bun run test:e2e:embeddings  # Embedding quality only
bun run test:e2e:retrieval   # Retrieval ranking only
```

### Test Database

Integration and E2E tests run against a Neon test branch. The connection string is in `apps/api/.env.test` (not committed to git). Ask a team member for the test branch credentials, or create your own Neon branch.

### E2E Test Setup

E2E tests hit real Claude and Voyage AI APIs, which costs money. They require a separate env file:

```bash
cp apps/api/.env.test.live.example apps/api/.env.test.live
# Fill in real ANTHROPIC_API_KEY and VOYAGE_API_KEY
```

### Test Structure

```
apps/api/src/__tests__/
  setup.ts             # Global preload: env vars, AI/embedding mocks
  setup.e2e.ts         # E2E preload: env vars only, NO mocks
  helpers/
    jwt.ts             # Sign test JWTs
    seed.ts            # Seed DB with test data
    app.ts             # Create test Elysia app instance
  unit/                # Fast, no DB, mocked dependencies
  integration/         # Real DB, mocked AI only
  e2e/                 # Real everything: Claude, Voyage, pgvector
    helpers.ts         # E2E seed/cleanup utilities
    embedding-quality  # Voyage vector quality assertions
    retrieval-ranking  # Hybrid search with real vectors
    chat-live          # Full chat with streaming
    onboarding-live    # Structured output parsing
    extraction-pipeline # Extract + embed + store + retrieve
    memory-lifecycle   # Golden path end-to-end
    prompt-regression  # Prompt quality fixture assertions
```

### Writing Tests

- Use `truncateAll()` in `beforeEach` for DB isolation (unit/integration)
- Use `signTestToken()` for authenticated requests
- Use `seedUsers()`, `seedConversation()`, `seedMemoryProfile()`, etc. for test data
- AI and embedding services are always mocked in unit/integration — never call real APIs
- E2E tests use their own helpers (`e2e/helpers.ts`): `e2eCleanup()`, `e2eSeedUser()`, `buildE2EProfile()`
- Run `bun run test` before submitting PRs

### Manual Testing

For Postman setup, curl cheatsheets (including SSE streaming), and JWT generation:
- See `docs/MANUAL_TESTING.md`
- Import the Postman collection from `docs/postman/`

## Git Workflow

- `main` is the primary branch
- Create feature branches from `main`
- Keep commits focused and descriptive
- No force-pushing to `main`

## Architecture Decisions

Before making significant changes, read the relevant docs:
- `docs/ARCHITECTURE.md` — System design, data flows, scaling
- `docs/MEMORY_SYSTEM.md` — Memory architecture, hybrid retrieval
- `docs/ALLY_PERSONALITY.md` — Ally's voice and behavior guidelines
- `CLAUDE.md` — AI agent instructions (also useful for humans)
