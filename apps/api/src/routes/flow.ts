import { Hono } from 'hono'
import { db } from '../db/client.js'
import { agentFlowEdges } from '../db/schema.js'
import { eq, gte, desc, sql } from 'drizzle-orm'

export const flowRouter = new Hono()

flowRouter.get('/graph', async (c) => {
  const window = c.req.query('window') ?? '24h'
  const hours = { '1h': 1, '6h': 6, '24h': 24, '7d': 168 }[window] ?? 24
  const since = new Date(Date.now() - hours * 3600 * 1000)

  const edges = await db.select().from(agentFlowEdges)
    .where(gte(agentFlowEdges.occurredAt, since))
    .orderBy(desc(agentFlowEdges.occurredAt))
    .limit(500)

  const nodeIds = new Set<string>()
  for (const e of edges) {
    nodeIds.add(e.fromAgentId)
    nodeIds.add(e.toAgentId)
  }

  return c.json({
    nodes: [...nodeIds].map((id) => ({ id })),
    edges,
  })
})

flowRouter.get('/edges', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') ?? '100'), 500)
  const edges = await db.select().from(agentFlowEdges).orderBy(desc(agentFlowEdges.occurredAt)).limit(limit)
  return c.json(edges)
})

export default flowRouter
