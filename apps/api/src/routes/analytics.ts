import { Hono } from 'hono'
import { db } from '../db/client.js'
import { tokenEvents } from '../db/schema.js'
import { eq, gte, lte, and, sql, desc } from 'drizzle-orm'
import { analyticsIngestWorker } from '../workers/analytics.js'

export const analyticsRouter = new Hono()

analyticsRouter.get('/summary', async (c) => {
  const from = c.req.query('from')
  const to = c.req.query('to')

  let where = sql`1=1`
  if (from) where = sql`${where} AND ${tokenEvents.turnTimestamp} >= ${from}::timestamptz`
  if (to) where = sql`${where} AND ${tokenEvents.turnTimestamp} <= ${to}::timestamptz`

  const [result] = await db.select({
    totalCostUsd: sql<string>`COALESCE(SUM(CAST(${tokenEvents.costUsd} AS NUMERIC)), 0)::text`,
    totalInputTokens: sql<number>`COALESCE(SUM(${tokenEvents.inputTokens}), 0)::int`,
    totalOutputTokens: sql<number>`COALESCE(SUM(${tokenEvents.outputTokens}), 0)::int`,
    totalCacheReadTokens: sql<number>`COALESCE(SUM(${tokenEvents.cacheReadTokens}), 0)::int`,
    totalCacheWriteTokens: sql<number>`COALESCE(SUM(${tokenEvents.cacheWriteTokens}), 0)::int`,
    turnCount: sql<number>`COUNT(*)::int`,
  }).from(tokenEvents).where(where)

  const cacheHitPct = result.totalInputTokens > 0
    ? (result.totalCacheReadTokens / result.totalInputTokens) * 100
    : 0

  return c.json({ ...result, cacheHitPct: Math.round(cacheHitPct * 10) / 10 })
})

analyticsRouter.get('/by-agent', async (c) => {
  const from = c.req.query('from')
  const to = c.req.query('to')

  let where = sql`1=1`
  if (from) where = sql`${where} AND ${tokenEvents.turnTimestamp} >= ${from}::timestamptz`
  if (to) where = sql`${where} AND ${tokenEvents.turnTimestamp} <= ${to}::timestamptz`

  const result = await db.select({
    agentId: tokenEvents.agentId,
    totalCostUsd: sql<string>`SUM(CAST(${tokenEvents.costUsd} AS NUMERIC))::text`,
    inputTokens: sql<number>`SUM(${tokenEvents.inputTokens})::int`,
    outputTokens: sql<number>`SUM(${tokenEvents.outputTokens})::int`,
    cacheReadTokens: sql<number>`SUM(${tokenEvents.cacheReadTokens})::int`,
    cacheWriteTokens: sql<number>`SUM(${tokenEvents.cacheWriteTokens})::int`,
    turnCount: sql<number>`COUNT(*)::int`,
  }).from(tokenEvents).where(where).groupBy(tokenEvents.agentId).orderBy(sql`SUM(CAST(${tokenEvents.costUsd} AS NUMERIC)) DESC`)

  return c.json(result)
})

analyticsRouter.get('/by-model', async (c) => {
  const from = c.req.query('from')
  const to = c.req.query('to')

  let where = sql`1=1`
  if (from) where = sql`${where} AND ${tokenEvents.turnTimestamp} >= ${from}::timestamptz`
  if (to) where = sql`${where} AND ${tokenEvents.turnTimestamp} <= ${to}::timestamptz`

  const result = await db.select({
    modelId: tokenEvents.modelId,
    provider: tokenEvents.provider,
    totalCostUsd: sql<string>`SUM(CAST(${tokenEvents.costUsd} AS NUMERIC))::text`,
    inputTokens: sql<number>`SUM(${tokenEvents.inputTokens})::int`,
    outputTokens: sql<number>`SUM(${tokenEvents.outputTokens})::int`,
    turnCount: sql<number>`COUNT(*)::int`,
  }).from(tokenEvents).where(where).groupBy(tokenEvents.modelId, tokenEvents.provider).orderBy(sql`SUM(CAST(${tokenEvents.costUsd} AS NUMERIC)) DESC`)

  return c.json(result)
})

analyticsRouter.get('/timeseries', async (c) => {
  const from = c.req.query('from')
  const to = c.req.query('to')
  const bucket = c.req.query('bucket') ?? 'hourly'

  const truncFn = bucket === 'daily' ? 'day' : 'hour'
  let where = sql`1=1`
  if (from) where = sql`${where} AND ${tokenEvents.turnTimestamp} >= ${from}::timestamptz`
  if (to) where = sql`${where} AND ${tokenEvents.turnTimestamp} <= ${to}::timestamptz`

  const result = await db.select({
    bucket: sql<string>`DATE_TRUNC('${sql.raw(truncFn)}', ${tokenEvents.turnTimestamp})::text`,
    agentId: tokenEvents.agentId,
    costUsd: sql<string>`SUM(CAST(${tokenEvents.costUsd} AS NUMERIC))::text`,
    tokens: sql<number>`SUM(${tokenEvents.inputTokens} + ${tokenEvents.outputTokens})::int`,
  }).from(tokenEvents).where(where)
    .groupBy(sql`DATE_TRUNC('${sql.raw(truncFn)}', ${tokenEvents.turnTimestamp})`, tokenEvents.agentId)
    .orderBy(sql`1`)

  return c.json(result)
})

analyticsRouter.post('/ingest', async (c) => {
  await analyticsIngestWorker.run()
  return c.json({ ok: true })
})

export default analyticsRouter
