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
