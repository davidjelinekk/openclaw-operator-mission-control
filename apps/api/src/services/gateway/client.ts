import WebSocket from 'ws'
import { randomUUID } from 'node:crypto'
import { config } from '../../config.js'
import {
  loadOrCreateDeviceIdentity,
  publicKeyRawBase64url,
  buildDeviceAuthPayload,
  signDevicePayload,
} from './device.js'

const PROTOCOL_VERSION = 3
const CONNECT_TIMEOUT_MS = 5000
const REQUEST_TIMEOUT_MS = 30000
const MAX_BACKOFF_MS = 30_000
const CLIENT_ID = 'gateway-client'
const CLIENT_MODE = 'backend'

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

type EventHandler = (data: unknown) => void

const PING_INTERVAL_MS = 30_000

class GatewayClient {
  private ws: WebSocket | null = null
  private pending = new Map<string, PendingRequest>()
  private subscriptions = new Map<string, EventHandler[]>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private reconnectDelay = 1000
  private connected = false
  private connecting = false
  private stopped = false

  connect(): void {
    if (this.connecting || this.connected || this.stopped) return
    this.connecting = true
    const url = new URL(config.GATEWAY_URL)
    url.searchParams.set('token', config.GATEWAY_TOKEN)
    const wsUrl = url.toString()

    const ws = new WebSocket(wsUrl)
    this.ws = ws

    const onFirstMessage = (raw: Buffer): void => {
      try {
        const data = JSON.parse(raw.toString())
        if (data?.type === 'event' && data?.event === 'connect.challenge') {
          this._sendConnect(ws, data?.payload?.nonce ?? null)
        } else {
          // No challenge received — connect without nonce
          this._sendConnect(ws, null)
          // Still handle this message as a regular message
          this._handleMessage(raw.toString())
        }
      } catch {
        this._sendConnect(ws, null)
      }
    }

    let firstMessage = true

    ws.on('open', () => {
      // Wait briefly for challenge, then connect if none arrives
      const challengeTimer = setTimeout(() => {
        if (firstMessage) {
          firstMessage = false
          this._sendConnect(ws, null)
        }
      }, CONNECT_TIMEOUT_MS)

      ws.once('message', (raw: Buffer) => {
        if (firstMessage) {
          firstMessage = false
          clearTimeout(challengeTimer)
          onFirstMessage(raw)
        }
      })
    })

    ws.on('message', (raw: Buffer) => {
      if (!firstMessage) {
        this._handleMessage(raw.toString())
      }
    })

    ws.on('error', (err) => {
      console.error('[gateway] ws error:', err.message)
    })

    ws.on('close', () => {
      this.connected = false
      this.connecting = false
      this.ws = null
      this._stopPing()
      this._rejectAll(new Error('Gateway disconnected'))
      if (!this.stopped) {
        this._scheduleReconnect()
      }
    })
  }

  private _sendConnect(ws: WebSocket, nonce: string | null): void {
    const identity = loadOrCreateDeviceIdentity()
    const signedAtMs = Date.now()

    const payloadStr = buildDeviceAuthPayload({
      deviceId: identity.deviceId,
      clientId: CLIENT_ID,
      clientMode: CLIENT_MODE,
      role: 'operator',
      scopes: ['operator.read', 'operator.admin', 'operator.approvals', 'operator.pairing'],
      signedAtMs,
      token: config.GATEWAY_TOKEN,
      nonce,
    })
    const signature = signDevicePayload(identity.privateKeyPem, payloadStr)

    const devicePayload: Record<string, unknown> = {
      id: identity.deviceId,
      publicKey: publicKeyRawBase64url(identity.publicKeyPem),
      signature,
      signedAt: signedAtMs,
    }
    if (nonce) devicePayload['nonce'] = nonce

    const params: Record<string, unknown> = {
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      role: 'operator',
      scopes: ['operator.read', 'operator.admin', 'operator.approvals', 'operator.pairing'],
      auth: { token: config.GATEWAY_TOKEN },
      client: {
        id: CLIENT_ID,
        version: '1.0.0',
        platform: process.platform,
        mode: CLIENT_MODE,
      },
      device: devicePayload,
    }

    const id = randomUUID()
    const connectPromise = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('Connect timeout'))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(id, { resolve, reject, timer })
    })

    ws.send(JSON.stringify({ type: 'req', id, method: 'connect', params }))

    connectPromise.then(() => {
      this.connected = true
      this.connecting = false
      this.reconnectDelay = 1000
      console.log('[gateway] connected')
      this._startPing()
    }).catch((err: Error) => {
      console.error('[gateway] connect failed:', err.message)
      this.connecting = false
      ws.close()
    })
  }

  private _handleMessage(raw: string): void {
    let data: Record<string, unknown>
    try {
      data = JSON.parse(raw)
    } catch {
      return
    }

    if (data['type'] === 'res' && typeof data['id'] === 'string') {
      const req = this.pending.get(data['id'])
      if (req) {
        clearTimeout(req.timer)
        this.pending.delete(data['id'])
        if (data['ok'] === false) {
          const msg = (data['error'] as Record<string, unknown>)?.['message'] as string ?? 'Gateway error'
          req.reject(new Error(msg))
        } else {
          req.resolve(data['payload'] ?? data['result'])
        }
      }
      return
    }

    if (data['type'] === 'event' && typeof data['event'] === 'string') {
      const handlers = this.subscriptions.get(data['event'] as string) ?? []
      for (const h of handlers) h(data['payload'])
    }
  }

  private _rejectAll(err: Error): void {
    for (const [, req] of this.pending) {
      clearTimeout(req.timer)
      req.reject(err)
    }
    this.pending.clear()
  }

  private _startPing(): void {
    this._stopPing()
    this.pingTimer = setInterval(() => {
      if (this.connected && this.ws) {
        this.ws.ping()
      }
    }, PING_INTERVAL_MS)
  }

  private _stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  private _scheduleReconnect(): void {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_BACKOFF_MS)
      this.connect()
    }, this.reconnectDelay)
  }

  async call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.connected || !this.ws) {
      throw new Error('Gateway not connected')
    }
    const id = randomUUID()
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Gateway timeout: ${method}`))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      })
      this.ws!.send(JSON.stringify({ type: 'req', id, method, params: params ?? {} }))
    })
  }

  subscribe(event: string, handler: EventHandler): () => void {
    const handlers = this.subscriptions.get(event) ?? []
    handlers.push(handler)
    this.subscriptions.set(event, handlers)
    return () => {
      const h = this.subscriptions.get(event) ?? []
      this.subscriptions.set(event, h.filter((x) => x !== handler))
    }
  }

  isConnected(): boolean {
    return this.connected
  }

  stop(): void {
    this.stopped = true
    this._stopPing()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
  }
}

export const gatewayClient = new GatewayClient()
