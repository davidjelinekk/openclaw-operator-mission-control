import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { gatewayClient } from '../services/gateway/client.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { config } from '../config.js'

export const agentsRouter = new Hono()

interface AgentConfig {
  id: string
  name?: string
  identity?: { name?: string; emoji?: string; theme?: string }
  model?: { primary?: string; fallbacks?: string[] }
  heartbeat?: unknown
  skills?: Record<string, unknown>
}

function loadAgentsFromConfig(): AgentConfig[] {
  try {
    const cfg = JSON.parse(readFileSync(join(config.OPENCLAW_HOME, 'openclaw.json'), 'utf-8')) as {
      agents?: { list?: AgentConfig[] }
    }
    return cfg?.agents?.list ?? []
  } catch {
    return []
  }
}

function saveAgentsToConfig(agents: AgentConfig[]): void {
  const cfgPath = join(config.OPENCLAW_HOME, 'openclaw.json')
  const raw = JSON.parse(readFileSync(cfgPath, 'utf-8'))
  raw.agents = raw.agents ?? {}
  raw.agents.list = agents
  writeFileSync(cfgPath, JSON.stringify(raw, null, 2))
}

agentsRouter.get('/', async (c) => {
  const configAgents = loadAgentsFromConfig()
  let liveAgents: Array<Record<string, unknown>> = []
  const onlineAgentIds = new Set<string>()

  try {
    // Derive online status from health sessions
    const health = await gatewayClient.call<unknown>('health')
    const sessions = (health as Record<string, unknown>)?.['sessions']
    if (Array.isArray(sessions)) {
      for (const s of sessions as Array<Record<string, unknown>>) {
        const aid = s['agentId'] ?? s['agent_id']
        if (typeof aid === 'string') onlineAgentIds.add(aid)
      }
    }
  } catch {
    // health unavailable — online status unknown
  }

  try {
    const result = await gatewayClient.call<unknown>('agents.list')
    const arr = Array.isArray(result) ? result
      : (result as Record<string, unknown>)?.['agents']
    liveAgents = Array.isArray(arr) ? arr as Array<Record<string, unknown>> : []
  } catch {
    // gateway may be down; return config-only list
  }

  const liveMap = new Map<string, Record<string, unknown>>()
  for (const a of liveAgents) {
    if (typeof a['id'] === 'string') liveMap.set(a['id'], a)
  }

  const gatewayReachable = liveAgents.length > 0 || onlineAgentIds.size > 0
  const merged = configAgents.map((agent) => {
    const live = liveMap.get(agent.id) ?? {}
    const status = onlineAgentIds.has(agent.id)
      ? 'online'
      : gatewayReachable
        ? 'offline'
        : 'unknown'
    return {
      id: agent.id,
      name: agent.name ?? agent.identity?.name ?? agent.id,
      emoji: agent.identity?.emoji ?? null,
      theme: agent.identity?.theme ?? null,
      primaryModel: agent.model?.primary ?? null,
      fallbackModels: agent.model?.fallbacks ?? [],
      hasHeartbeat: !!(agent.heartbeat),
      status,
      sessionCount: onlineAgentIds.has(agent.id) ? 1 : 0,
      ...live,
    }
  })
  return c.json(merged)
})

agentsRouter.get('/:id', async (c) => {
  const agentId = c.req.param('id')
  const configAgents = loadAgentsFromConfig()
  const agent = configAgents.find((a) => a.id === agentId)
  if (!agent) return c.json({ error: 'Not found' }, 404)
  let liveData: Record<string, unknown> = {}
  try {
    const result = await gatewayClient.call<unknown>('agents.list')
    const arr = Array.isArray(result) ? result
      : (result as Record<string, unknown>)?.['agents']
    const liveAgents = Array.isArray(arr) ? arr as Array<Record<string, unknown>> : []
    liveData = liveAgents.find((a) => a['id'] === agentId) ?? {}
  } catch {
    // ignore
  }
  return c.json({ ...agent, ...liveData })
})

agentsRouter.patch('/:id', zValidator('json', z.object({ name: z.string().optional(), description: z.string().optional() })), async (c) => {
  const agentId = c.req.param('id')
  const { name, description } = c.req.valid('json')
  try {
    const result = await gatewayClient.call('agent.update', { id: agentId, name, description })
    return c.json(result)
  } catch (err) {
    return c.json({ error: String(err) }, 502)
  }
})

agentsRouter.post('/', zValidator('json', z.object({
  name: z.string().min(1),
  emoji: z.string().optional(),
  theme: z.string().optional(),
  primaryModel: z.string().optional(),
  fallbackModels: z.array(z.string()).optional(),
  heartbeatInterval: z.string().optional(),
})), async (c) => {
  const body = c.req.valid('json')
  const id = randomUUID()
  const newAgent: AgentConfig = {
    id,
    name: body.name,
    identity: { name: body.name, emoji: body.emoji, theme: body.theme },
    model: { primary: body.primaryModel, fallbacks: body.fallbackModels ?? [] },
    heartbeat: body.heartbeatInterval ? { every: body.heartbeatInterval } : undefined,
  }
  const existing = loadAgentsFromConfig()
  saveAgentsToConfig([...existing, newAgent])
  try { await gatewayClient.call('agent.create', { id, name: body.name }) } catch { /* ignore */ }
  return c.json(newAgent, 201)
})

agentsRouter.delete('/:id', async (c) => {
  const agentId = c.req.param('id')
  const existing = loadAgentsFromConfig()
  const filtered = existing.filter((a) => a.id !== agentId)
  if (filtered.length === existing.length) return c.json({ error: 'Not found' }, 404)
  saveAgentsToConfig(filtered)
  try { await gatewayClient.call('agent.delete', { id: agentId }) } catch { /* ignore */ }
  return c.json({ ok: true })
})

agentsRouter.get('/:id/sessions', async (c) => {
  const agentId = c.req.param('id')
  try {
    const sessions = await gatewayClient.call('sessions.list', { agentId })
    return c.json(sessions)
  } catch (err) {
    return c.json({ error: String(err) }, 502)
  }
})

export default agentsRouter
