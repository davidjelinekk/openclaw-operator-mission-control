import type { IncomingMessage } from 'node:http'
import type { WebSocket as WsType } from 'ws'
import { WebSocketServer } from 'ws'
import { db } from '../db/client.js'
import { boards, tasks } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { redis, redisSub } from '../lib/redis.js'
import { validateWsToken } from '../lib/auth.js'

const boardSockets = new Map<string, Set<WsType>>()
const subInitialized = new Set<string>()

async function ensureSubscribed(boardId: string): Promise<void> {
  if (subInitialized.has(boardId)) return
  subInitialized.add(boardId)
  await redisSub.subscribe(`board:${boardId}`)
}

redisSub.on('message', (channel: string, message: string) => {
  const boardId = channel.replace('board:', '')
  const sockets = boardSockets.get(boardId)
  if (!sockets) return
  for (const ws of sockets) {
    if (ws.readyState === 1) ws.send(message)
  }
})

export function createBoardWsHandler(): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true })

  wss.on('connection', async (ws: WsType, req: IncomingMessage, boardId: string) => {
    if (!boardSockets.has(boardId)) boardSockets.set(boardId, new Set())
    boardSockets.get(boardId)!.add(ws)
    await ensureSubscribed(boardId)

    // Send initial snapshot
    const [board] = await db.select().from(boards).where(eq(boards.id, boardId))
    const boardTasks = board ? await db.select().from(tasks).where(eq(tasks.boardId, boardId)) : []
    ws.send(JSON.stringify({ type: 'snapshot', board, tasks: boardTasks }))

    const ping = setInterval(() => {
      if (ws.readyState === 1) ws.ping()
    }, 30_000)

    ws.on('message', async (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'task.move' && msg.taskId && msg.status) {
          await db.update(tasks).set({ status: msg.status, updatedAt: new Date() }).where(eq(tasks.id, msg.taskId))
          const [updated] = await db.select().from(tasks).where(eq(tasks.id, msg.taskId))
          if (updated) {
            await redis.publish(`board:${boardId}`, JSON.stringify({ type: 'task.status', taskId: msg.taskId, status: msg.status }))
          }
        }
      } catch {
        // ignore malformed
      }
    })

    ws.on('close', () => {
      clearInterval(ping)
      boardSockets.get(boardId)?.delete(ws)
    })
  })

  return wss
}
