import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/client.js'
import { people, personThreads, personTasks, personProjects, tasks, projects } from '../db/schema.js'
import { eq, desc, and, sql, count } from 'drizzle-orm'
import { CreatePersonSchema, UpdatePersonSchema, CreatePersonThreadSchema } from '@oc-operator/shared-types'

const router = new Hono()

// List all people
router.get('/', async (c) => {
  const rows = await db
    .select({
      person: people,
      threadCount: sql<number>`cast(count(${personThreads.id}) as int)`,
      lastActiveAt: sql<string | null>`max(${personThreads.lastMessageAt})`,
    })
    .from(people)
    .leftJoin(personThreads, eq(personThreads.personId, people.id))
    .groupBy(people.id)
    .orderBy(desc(people.updatedAt))
  return c.json(rows.map(r => ({ ...r.person, threadCount: r.threadCount, lastActiveAt: r.lastActiveAt })))
})

// Create person
router.post('/', zValidator('json', CreatePersonSchema), async (c) => {
  const data = c.req.valid('json')
  const [person] = await db.insert(people).values(data).returning()
  return c.json(person, 201)
})

// Get person detail with threads, tasks, projects
router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [person] = await db.select().from(people).where(eq(people.id, id))
  if (!person) return c.json({ error: 'Not found' }, 404)

  const threads = await db.select().from(personThreads)
    .where(eq(personThreads.personId, id))
    .orderBy(desc(personThreads.lastMessageAt))

  const linkedTasks = await db.select({ task: tasks })
    .from(personTasks)
    .leftJoin(tasks, eq(personTasks.taskId, tasks.id))
    .where(eq(personTasks.personId, id))

  const linkedProjects = await db.select({ project: projects })
    .from(personProjects)
    .leftJoin(projects, eq(personProjects.projectId, projects.id))
    .where(eq(personProjects.personId, id))

  return c.json({ person, threads, tasks: linkedTasks, projects: linkedProjects })
})

// Update person
router.patch('/:id', zValidator('json', UpdatePersonSchema), async (c) => {
  const id = c.req.param('id')
  const data = c.req.valid('json')
  const [person] = await db.update(people).set({ ...data, updatedAt: new Date() })
    .where(eq(people.id, id)).returning()
  if (!person) return c.json({ error: 'Not found' }, 404)
  return c.json(person)
})

// Delete person
router.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const [deleted] = await db.delete(people).where(eq(people.id, id)).returning()
  if (!deleted) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})

// Add thread
router.post('/:id/threads', zValidator('json', CreatePersonThreadSchema), async (c) => {
  const personId = c.req.param('id')
  const data = c.req.valid('json')
  const [thread] = await db.insert(personThreads).values({
    personId,
    ...data,
    lastMessageAt: data.lastMessageAt ? new Date(data.lastMessageAt) : undefined,
  }).returning()
  return c.json(thread, 201)
})

// Link task
router.post('/:id/tasks', zValidator('json', z.object({ taskId: z.string().uuid() })), async (c) => {
  const personId = c.req.param('id')
  const { taskId } = c.req.valid('json')
  await db.insert(personTasks).values({ personId, taskId }).onConflictDoNothing()
  return c.json({ ok: true }, 201)
})

// Unlink task
router.delete('/:id/tasks/:taskId', async (c) => {
  const personId = c.req.param('id')
  const taskId = c.req.param('taskId')
  await db.delete(personTasks).where(and(eq(personTasks.personId, personId), eq(personTasks.taskId, taskId)))
  return c.json({ ok: true })
})

// Link project
router.post('/:id/projects', zValidator('json', z.object({ projectId: z.string().uuid() })), async (c) => {
  const personId = c.req.param('id')
  const { projectId } = c.req.valid('json')
  await db.insert(personProjects).values({ personId, projectId }).onConflictDoNothing()
  return c.json({ ok: true }, 201)
})

export default router
