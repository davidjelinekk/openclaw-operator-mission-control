import { db } from '../db/client.js'
import { agentFlowEdges } from '../db/schema.js'
import { redis } from '../lib/redis.js'
import { gatewayClient } from '../services/gateway/client.js'
import { sql } from 'drizzle-orm'

// logs.tail returns { file, cursor, size, lines: string[], truncated, reset }
// where each element of `lines` is a raw log file line (a JSON-stringified
// logger entry with shape { "0": <message>, "_meta": { ... }, "time": "..." }).
//
// The gateway does not emit structured inter-agent routing events in its logs.
// There are no "agent.dispatch" or "subagent.spawn" event types. Until the
// gateway exposes a structured event stream (e.g. via subscribe()), this worker
// will always produce 0 edges. It is kept here as the integration point for
// when that becomes available.
interface LogLine {
  event?: string
  agent?: string
  target?: string
  session?: string
  timestamp?: string
  cost?: string | number
}

interface LogsTailResult {
  lines: string[]
  cursor: number
  size: number
  truncated: boolean
  reset: boolean
}

async function runFlowTail(): Promise<void> {
  let rawLines: string[] = []
  try {
    const result = await gatewayClient.call<LogsTailResult>('logs.tail', { limit: 500 })
    rawLines = Array.isArray(result?.lines) ? result.lines : []
  } catch {
    return
  }

  const edges: typeof agentFlowEdges.$inferInsert[] = []

  for (const raw of rawLines) {
    let l: LogLine
    try {
      l = JSON.parse(raw) as LogLine
    } catch {
      continue
    }
    if (!l.event || !l.agent || !l.target) continue
    if (l.event !== 'agent.dispatch' && l.event !== 'subagent.spawn') continue

    edges.push({
      fromAgentId: l.agent,
      toAgentId: l.target,
      messageType: l.event,
      sessionId: l.session ?? null,
      tokenCost: l.cost ? String(l.cost) : null,
      occurredAt: l.timestamp ? new Date(l.timestamp) : new Date(),
      rawLogLine: raw,
    })
  }

  if (edges.length === 0) return

  const inserted = await db.insert(agentFlowEdges)
    .values(edges)
    .onConflictDoNothing()
    .returning()

  if (inserted.length > 0) {
    await redis.publish('flow:edges', JSON.stringify({ edges: inserted }))
  }
}

export const flowTailWorker = {
  run: runFlowTail,
}
