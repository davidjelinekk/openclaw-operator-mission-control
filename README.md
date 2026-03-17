# openclaw-operator-mission-control

Mission Control for [OpenClaw](https://openclaw.ai/) — a web-based operations dashboard for managing autonomous AI agent workloads. Coordinate multiple agents across Kanban boards, track task lifecycles with configurable approval workflows, visualize agent-to-agent communication in real time, and monitor token costs across your entire fleet.

## Key Features

### Board-Based Agent Coordination
Organize work into boards, each with a designated gateway agent that dispatches tasks. Configure per-board governance policies — require review before completion, block status changes during pending approvals, restrict transitions to lead agents, or mandate explicit approval before marking tasks done.

### Task Lifecycle Management
Full workflow engine: inbox → in_progress → review → done (or abandoned). Atomic task claiming prevents two agents from grabbing the same work. Dependency tracking with circular-dependency detection ensures correct execution order. Priority-based queuing respects blocking relationships so agents only see actionable work.

### Project Orchestration
Group tasks into projects with sequential or parallel execution modes. Each project gets a dedicated orchestrator agent and an optional filesystem workspace. Progress is auto-calculated as tasks complete.

### AI-Guided Task Planning
Stateful planning sessions where the gateway agent generates task specifications, suggests execution agents, and iterates via a callback API. Sessions use UUID-based auth tokens and persist the resulting plan on the task.

### Flow Visualization
Real-time directed graph of agent-to-agent communication. Time-windowed analysis (1h / 6h / 24h / 7d) with synthetic dispatch edges inferred from task assignments, message-type tracking, and per-edge token cost attribution.

### Token Analytics & Cost Tracking
Ingest token events (input, output, cache read, cache write) and aggregate by agent, model, project, or time bucket. Track cost attribution down to individual tasks, monitor cache hit rates, and surface failed-task investigations with full context.

### Approval Workflows
Create approvals with confidence scores and rubric data. Board-level policies enforce workflow gates — tasks can be frozen until approvals resolve. Resolution events propagate via SSE streams and notify the gateway agent automatically.

### Real-Time Event System
Four complementary channels keep everything in sync:
- **WebSocket** — board state changes and flow graph updates
- **Server-Sent Events** — activity streams and approval status changes
- **Redis pub/sub** — internal event dispatch between workers
- **Outbound webhooks** — 8 event types with HMAC-SHA256 signing, board scoping, and test delivery

### People, Tags & Custom Fields
Link people to tasks and projects, track conversation threads per person. Tag tasks with board-scoped labels. Define custom field schemas per board and attach typed values to tasks.

### Cron Scheduling
Create and manage scheduled jobs with run-history tracking. Merges local jobs with gateway-managed schedules and supports manual triggering.

### Skills & Skill Packs
Registry of agent capabilities synced from the OpenClaw runtime. Snapshot skill state, track installations and dependencies, and organize skills into distributable packs.

### Search
Unified full-text search across tasks and boards from a single endpoint.

## Tech Stack

| Layer | Tech |
|-------|------|
| API | Node.js 22, Hono, Drizzle ORM, PostgreSQL, Redis, WebSockets |
| Web | React 19, TanStack Router, Tailwind CSS, Vite |
| Shared | Zod schemas (`@openclaw-operator/shared-types`) |
| Monorepo | pnpm workspaces + Turborepo |

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
  api/                # Hono REST API + WebSocket server
    src/
      routes/         # 24 route modules (boards, tasks, agents, flow, ...)
      db/schema/      # Drizzle ORM schema (7 domain modules)
      db/migrations/  # SQL migrations
      workers/        # Background jobs (analytics, skills, flow)
      services/       # Gateway client, device identity
      ws/             # WebSocket handlers (board, flow)
      lib/            # Auth, Redis, webhooks, worker registry
  web/                # React SPA (Vite + TanStack Router)
    src/
      routes/         # 25+ page routes
      hooks/api/      # TanStack Query hooks for every API domain
      components/     # Atoms (StatusDot, AgentChip) + organisms (Kanban, Sidebar)
      store/          # Zustand stores (auth, toast, UI)
packages/
  shared-types/       # Zod schemas shared between API and web
  tsconfig/           # Shared TypeScript configs
```

## Related

- [OpenClaw](https://openclaw.ai/) — the agent runtime this operator manages

## License

[MIT](LICENSE)
