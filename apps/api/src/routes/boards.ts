import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { db } from '../db/client.js'
import { boards, tasks, approvals } from '../db/schema.js'
import { eq, desc, count } from 'drizzle-orm'
import { CreateBoardSchema, UpdateBoardSchema } from '@oc-operator/shared-types'
import { redis } from '../lib/redis.js'

export const boardsRouter = new Hono()

boardsRouter.get('/', async (c) => {
  const result = await db.select().from(boards).orderBy(desc(boards.createdAt))
  return c.json(result)
})

boardsRouter.post('/', zValidator('json', CreateBoardSchema), async (c) => {
  const { targetDate, ...rest } = c.req.valid('json')
  const slug = rest.slug ?? rest.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const values = {
    ...rest,
    slug,
    ...(targetDate !== undefined && { targetDate: targetDate ? new Date(targetDate) : null }),
  }
  const [board] = await db.insert(boards).values(values).returning()
  return c.json(board, 201)
})

boardsRouter.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [board] = await db.select().from(boards).where(eq(boards.id, id))
  if (!board) return c.json({ error: 'Not found' }, 404)
  return c.json(board)
})

boardsRouter.patch('/:id', zValidator('json', UpdateBoardSchema), async (c) => {
  const id = c.req.param('id')
  const { targetDate, ...rest } = c.req.valid('json')
  const updates = {
    ...rest,
    ...(targetDate !== undefined && { targetDate: targetDate ? new Date(targetDate) : null }),
    updatedAt: new Date(),
  }
  const [board] = await db.update(boards).set(updates).where(eq(boards.id, id)).returning()
  if (!board) return c.json({ error: 'Not found' }, 404)
  return c.json(board)
})

boardsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await db.delete(boards).where(eq(boards.id, id))
  return c.json({ ok: true })
})

boardsRouter.get('/:id/snapshot', async (c) => {
  const id = c.req.param('id')
  const [board] = await db.select().from(boards).where(eq(boards.id, id))
  if (!board) return c.json({ error: 'Not found' }, 404)
  const boardTasks = await db.select().from(tasks).where(eq(tasks.boardId, id)).orderBy(desc(tasks.createdAt))
  const boardApprovals = await db.select().from(approvals).where(eq(approvals.boardId, id)).orderBy(desc(approvals.createdAt)).limit(50)
  return c.json({ board, tasks: boardTasks, approvals: boardApprovals })
})

export default boardsRouter
