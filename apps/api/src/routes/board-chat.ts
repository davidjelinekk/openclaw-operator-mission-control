import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/client.js'
import { boards, activityEvents } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { gatewayClient } from '../services/gateway/client.js'

const router = new Hono()

router.post(
  '/boards/:boardId/chat',
  zValidator('json', z.object({ message: z.string().min(1) })),
  async (c) => {
    const boardId = c.req.param('boardId')
    const { message } = c.req.valid('json')

    const [board] = await db.select().from(boards).where(eq(boards.id, boardId))
    if (!board) return c.json({ error: 'Not found' }, 404)

    if (board.gatewayAgentId) {
      await gatewayClient.call('chat.send', {
        agentId: board.gatewayAgentId,
        message,
        sessionKey: `operator:board:${boardId}`,
      })
    }

    await db.insert(activityEvents).values({
      boardId,
      eventType: 'board.chat',
      message,
      agentId: board.gatewayAgentId ?? undefined,
    })

    return c.json({ ok: true })
  },
)

export default router
