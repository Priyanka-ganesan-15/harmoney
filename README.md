# Harmoney

Harmoney is a couples financial dashboard built with Next.js, Tailwind CSS, and MongoDB. The product is designed around one shared household workspace, dual-partner access, persistent financial tracking, and a household-scoped financial literacy assistant.

## Current Scope

- Next.js App Router foundation with TypeScript and Tailwind CSS
- MongoDB-ready server utilities and environment validation stubs
- Testing baseline with Vitest and Playwright
- Documentation baseline intended to function as an internal developer wiki

## Tech Stack

- Next.js 16
- React 19
- Tailwind CSS 4
- MongoDB and Mongoose
- Zod and `@t3-oss/env-nextjs`
- React Hook Form and TanStack Query
- Vitest and Playwright

## Local Setup

1. Install dependencies:

```bash
pnpm install
```

2. Copy the environment file and fill in values:

```bash
cp .env.example .env.local
```

3. Start the development server:

```bash
pnpm dev
```

4. Open `http://localhost:3000`.

## Environment Variables

The project expects these values for local development:

- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `MONGODB_URI`
- `MONGODB_DB_NAME`
- `NEXT_PUBLIC_APP_URL`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`
- `EMBEDDING_MODEL`

See `.env.example` for defaults and placeholders.

## Scripts

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
pnpm typecheck
pnpm test
pnpm test:unit
pnpm test:e2e
pnpm format
pnpm format:check
```

## Documentation

- `docs/status.md`: current milestone, recent work, and next steps
- `docs/architecture.md`: system boundaries and application structure
- `docs/schema.md`: baseline MongoDB schema and data invariants
- `docs/rag.md`: document ingestion and advisor design
- `docs/runbooks.md`: local development and troubleshooting steps

## Deployment Direction

The initial repository is being prepared for Vercel and MongoDB Atlas. That target may change later, but the bootstrap assumes that deployment model.
