import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { gatewayClient } from '../services/gateway/client.js'
import { config } from '../config.js'

export const gatewayRouter = new Hono()

gatewayRouter.get('/status', async (c) => {
  try {
    const health = await gatewayClient.call('health')
    return c.json({ ok: true, connected: gatewayClient.isConnected(), health, gatewayUrl: config.GATEWAY_URL })
  } catch {
    return c.json({ ok: false, connected: gatewayClient.isConnected(), gatewayUrl: config.GATEWAY_URL })
  }
})

gatewayRouter.post('/rpc', zValidator('json', z.object({
  method: z.string(),
  params: z.record(z.unknown()).optional(),
})), async (c) => {
  const { method, params } = c.req.valid('json')
  try {
    const result = await gatewayClient.call(method, params)
    return c.json({ ok: true, result })
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 502)
  }
})

gatewayRouter.get('/sessions', async (c) => {
  try {
    const sessions = await gatewayClient.call('sessions.list')
    return c.json(sessions)
  } catch (err) {
    return c.json({ error: String(err) }, 502)
  }
})

export default gatewayRouter
