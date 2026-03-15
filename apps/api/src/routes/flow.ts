import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/client.js'
import { agentFlowEdges, tasks, boards } from '../db/schema.js'
import { gte, desc, isNotNull, and, eq } from 'drizzle-orm'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { config } from '../config.js'
import { gatewayClient } from '../services/gateway/client.js'

export const flowRouter = new Hono()

// ── Agent metadata helpers ────────────────────────────────────────────────────

interface AgentMeta {
  id: string
  name: string
  emoji: string | null
  isOnline: boolean
  hasActiveSession: boolean
}

async function loadAgentMeta(): Promise<Map<string, AgentMeta>> {
  const map = new Map<string, AgentMeta>()
  try {
    const cfg = JSON.parse(readFileSync(join(config.OPENCLAW_HOME, 'openclaw.json'), 'utf-8')) as {
      agents?: { list?: Array<{ id: string; identity?: { name?: string; emoji?: string }; name?: string }> }
    }
    for (const a of cfg?.agents?.list ?? []) {
      map.set(a.id, {
        id: a.id,
        name: a.identity?.name ?? a.name ?? a.id,
        emoji: a.identity?.emoji ?? null,
        isOnline: false,
        hasActiveSession: false,
      })
    }
  } catch { /* config unavailable */ }

  // Overlay online/session status from gateway
  try {
    const health = await gatewayClient.call<unknown>('health')
    const sessions = (health as Record<string, unknown>)?.['sessions']
    if (Array.isArray(sessions)) {
      for (const s of sessions as Array<Record<string, unknown>>) {
        const aid = String(s['agentId'] ?? s['agent_id'] ?? '')
        if (!aid) continue
        const existing = map.get(aid) ?? { id: aid, name: aid, emoji: null, isOnline: false, hasActiveSession: false }
        map.set(aid, { ...existing, isOnline: true, hasActiveSession: true })
      }
    }
  } catch { /* gateway unavailable */ }

  return map
}

// ── GET /graph ────────────────────────────────────────────────────────────────

flowRouter.get('/graph', async (c) => {
  const window = c.req.query('window') ?? '24h'
  const hours = { '1h': 1, '6h': 6, '24h': 24, '7d': 168 }[window] ?? 24
  const since = new Date(Date.now() - hours * 3600 * 1000)

  // Explicit edges written by agents / dispatch
  const explicitEdges = await db.select().from(agentFlowEdges)
    .where(gte(agentFlowEdges.occurredAt, since))
    .orderBy(desc(agentFlowEdges.occurredAt))
    .limit(500)

  // Synthetic dispatch edges: tasks that went in_progress in the window
  // from: board's gateway_agent_id (fallback 'system')  to: task's assigned_agent_id
  const dispatchedTasks = await db
    .select({
      taskId: tasks.id,
      assignedAgentId: tasks.assignedAgentId,
      inProgressAt: tasks.inProgressAt,
      gatewayAgentId: boards.gatewayAgentId,
    })
    .from(tasks)
    .innerJoin(boards, eq(tasks.boardId, boards.id))
    .where(and(
      isNotNull(tasks.assignedAgentId),
      isNotNull(tasks.inProgressAt),
      gte(tasks.inProgressAt, since),
    ))
    .limit(200)

  const syntheticEdges = dispatchedTasks.map((t) => ({
    id: `synthetic-dispatch-${t.taskId}`,
    fromAgentId: t.gatewayAgentId ?? 'system',
    toAgentId: t.assignedAgentId!,
    messageType: 'dispatch' as const,
    sessionId: null,
    taskId: t.taskId,
    tokenCost: null,
    occurredAt: t.inProgressAt!,
    rawLogLine: null,
  }))

  const allEdges = [...explicitEdges, ...syntheticEdges]

  // Collect all participating agent IDs
  const participatingIds = new Set<string>()
  for (const e of allEdges) {
    participatingIds.add(e.fromAgentId)
    participatingIds.add(e.toAgentId)
  }

  // Enrich nodes: all known agents + highlight those with edges
  const agentMeta = await loadAgentMeta()

  // Include all agents as nodes (not just those with edges in the window)
  const allAgentIds = new Set([...participatingIds, ...agentMeta.keys()])
  const nodes = [...allAgentIds].map((id) => {
    const meta = agentMeta.get(id)
    // Friendly label for built-in virtual nodes
    const fallbackName = id === 'system' ? 'System' : id.length > 24 ? `${id.slice(0, 8)}…` : id
    return {
      id,
      name: meta?.name ?? fallbackName,
      emoji: meta?.emoji ?? (id === 'system' ? '⚡' : null),
      isOnline: meta?.isOnline ?? false,
      hasActiveSession: meta?.hasActiveSession ?? false,
      hasEdges: participatingIds.has(id),
    }
  })

  return c.json({ nodes, edges: allEdges })
})

// ── POST /edges ───────────────────────────────────────────────────────────────

const edgeSchema = z.object({
  fromAgentId: z.string().min(1),
  toAgentId: z.string().min(1),
  messageType: z.string().min(1),
  sessionId: z.string().nullable().optional(),
  taskId: z.string().uuid().nullable().optional(),
  tokenCost: z.union([z.string(), z.number()]).nullable().optional(),
})

flowRouter.post('/edges', zValidator('json', edgeSchema), async (c) => {
  const body = c.req.valid('json')
  const [edge] = await db.insert(agentFlowEdges).values({
    fromAgentId: body.fromAgentId,
    toAgentId: body.toAgentId,
    messageType: body.messageType,
    sessionId: body.sessionId ?? null,
    taskId: body.taskId ?? null,
    tokenCost: body.tokenCost != null ? String(body.tokenCost) : null,
    occurredAt: new Date(),
  }).returning()
  return c.json(edge, 201)
})

// ── GET /edges ────────────────────────────────────────────────────────────────

flowRouter.get('/edges', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') ?? '100'), 500)
  const edges = await db.select().from(agentFlowEdges).orderBy(desc(agentFlowEdges.occurredAt)).limit(limit)
  return c.json(edges)
})

export default flowRouter
