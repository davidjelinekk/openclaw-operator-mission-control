import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { gatewayClient } from '../services/gateway/client.js'
import { redis } from '../lib/redis.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { config } from '../config.js'

export const cronRouter = new Hono()

function loadCronJobs(): unknown[] {
  try {
    const data = JSON.parse(readFileSync(join(config.OPENCLAW_HOME, 'cron', 'jobs.json'), 'utf-8'))
    return Array.isArray(data) ? data : data?.jobs ?? []
  } catch {
    return []
  }
}

/** Normalize a raw gateway/local job into the shape the frontend expects */
function normalizeJob(raw: Record<string, unknown>): Record<string, unknown> {
  // schedule: gateway may return { kind, expr, tz } or already a string
  let schedule: string = raw['schedule'] as string ?? ''
  const rawSchedule = raw['schedule']
  if (rawSchedule && typeof rawSchedule === 'object') {
    schedule = (rawSchedule as Record<string, unknown>)['expr'] as string ?? ''
  }

  // state block (gateway runtime data)
  const state = (raw['state'] ?? {}) as Record<string, unknown>

  const lastRunMs = state['lastRunMs'] as number | undefined
  const nextRunMs = state['nextRunMs'] as number | undefined
  const lastRunAt = raw['lastRunAt'] as string | undefined
    ?? (lastRunMs ? new Date(lastRunMs).toISOString() : undefined)
  const nextRunAt = raw['nextRunAt'] as string | undefined
    ?? (nextRunMs ? new Date(nextRunMs).toISOString() : undefined)

  const lastDurationMs = (raw['lastDurationMs'] ?? state['lastDurationMs']) as number | undefined

  const consecutiveErrors = (raw['consecutiveErrors'] ?? state['consecutiveErrors'] ?? 0) as number

  // status: local jobs may have 'disabled', gateway returns via state.lastStatus
  let status: string = (raw['status'] as string) ?? ''
  if (!status || status === '') {
    const lastStatus = state['lastStatus'] as string | undefined
    if (raw['enabled'] === false || raw['disabled'] === true) {
      status = 'disabled'
    } else if (lastStatus === 'running') {
      status = 'running'
    } else if (lastStatus === 'error' || lastStatus === 'failed') {
      status = 'error'
    } else if (lastStatus === 'timeout') {
      status = 'timeout'
    } else if (lastStatus === 'ok' || lastStatus === 'success') {
      status = 'ok'
    } else {
      status = lastRunAt ? 'ok' : 'disabled'
    }
  }

  return {
    ...raw,
    schedule,
    status,
    lastRunAt,
    nextRunAt,
    lastDurationMs,
    consecutiveErrors,
  }
}

cronRouter.get('/', async (c) => {
  const cached = await redis.get('cron:merged')
  if (cached) return c.json(JSON.parse(cached))

  const localJobs = loadCronJobs()
  let liveJobs: unknown[] = []
  try {
    const live = await gatewayClient.call<unknown[]>('cron.list')
    liveJobs = Array.isArray(live) ? live : []
  } catch {
    // ignore
  }

  const liveMap = new Map<string, Record<string, unknown>>()
  for (const j of liveJobs as Array<Record<string, unknown>>) {
    if (j['id']) liveMap.set(j['id'] as string, j)
  }

  const merged = localJobs.map((job) => {
    const j = job as Record<string, unknown>
    const liveData = liveMap.get(j['id'] as string) ?? {}
    const combined = { ...j, ...liveData }
    return normalizeJob(combined)
  })

  // Also include any live jobs not in local config
  for (const j of liveJobs as Array<Record<string, unknown>>) {
    const id = j['id'] as string
    if (id && !localJobs.some((lj) => (lj as Record<string, unknown>)['id'] === id)) {
      merged.push(normalizeJob(j))
    }
  }

  await redis.set('cron:merged', JSON.stringify(merged), 'EX', 60)
  return c.json(merged)
})

const createCronSchema = z.object({
  name: z.string().min(1),
  schedule: z.string().min(1),
  agentId: z.string().min(1),
  command: z.string().min(1),
})

cronRouter.post('/', zValidator('json', createCronSchema), async (c) => {
  const body = c.req.valid('json')
  try {
    const result = await gatewayClient.call('cron.create', {
      name: body.name,
      schedule: { kind: 'cron', expr: body.schedule },
      agentId: body.agentId,
      command: body.command,
    })
    await redis.del('cron:merged')
    return c.json(result, 201)
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 502)
  }
})

cronRouter.delete('/:id', async (c) => {
  const id = c.req.param('id')
  try {
    await gatewayClient.call('cron.delete', { id })
    await redis.del('cron:merged')
    return c.json({ ok: true })
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 502)
  }
})

cronRouter.post('/:id/run', async (c) => {
  const id = c.req.param('id')
  try {
    const result = await gatewayClient.call('cron.run', { id })
    await redis.del('cron:merged')
    return c.json({ ok: true, result })
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 502)
  }
})

cronRouter.get('/:id/runs', async (c) => {
  const id = c.req.param('id')
  try {
    const runs = await gatewayClient.call('cron.runs', { id })
    return c.json(runs)
  } catch (err) {
    return c.json({ error: String(err) }, 502)
  }
})

export default cronRouter
