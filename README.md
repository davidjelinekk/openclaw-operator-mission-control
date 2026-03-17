# openclaw-operator-mission-control

Mission Control for [OpenClaw](https://openclaw.ai/) — the autonomous agent work management and governance platform. Kanban boards, task orchestration, agent routing, flow visualization, and cron scheduling — all in one place.

## Tech Stack

- **API**: Node.js, Hono, Drizzle ORM, PostgreSQL, Redis, WebSockets
- **Web**: React, TanStack Router, Tailwind CSS, Vite
- **Shared**: Zod schemas in a shared-types package
- **Monorepo**: pnpm workspaces + Turborepo

## Prerequisites

- [OpenClaw](https://openclaw.ai/) installed and configured (`~/.openclaw`)
- Node.js 22+
- pnpm 10+
- PostgreSQL
- Redis

## Quick Start

```bash
# Install dependencies
pnpm install

# Configure environment
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env with your database and Redis URLs

# Run database migrations
cd apps/api && pnpm drizzle-kit push

# Start development
cd ../.. && pnpm dev
```

The API runs on `http://localhost:3001` and serves the web UI.

## Project Structure

```
apps/
  api/          # Hono REST API + WebSocket server
  web/          # React SPA (Vite + TanStack Router)
packages/
  shared-types/ # Zod schemas shared between API and web
  tsconfig/     # Shared TypeScript configs
```

## Related

- [OpenClaw](https://openclaw.ai/) — the agent runtime this operator manages

## License

[MIT](LICENSE)
