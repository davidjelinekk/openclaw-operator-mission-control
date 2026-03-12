import { createHash, createPrivateKey, createPublicKey, sign as cryptoSign } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'

interface DeviceIdentity {
  deviceId: string
  publicKeyPem: string
  privateKeyPem: string
}

function getIdentityPath(): string {
  const env = process.env['OPENCLAW_GATEWAY_DEVICE_IDENTITY_PATH']
  if (env?.trim()) return env.trim()
  return join(homedir(), '.openclaw', 'identity', 'device.json')
}

function derivePublicKeyRaw(publicKeyPem: string): Buffer {
  const key = createPublicKey(publicKeyPem)
  // SubjectPublicKeyInfo for Ed25519: 12-byte header + 32-byte key
  const der = key.export({ type: 'spki', format: 'der' }) as Buffer
  return der.slice(-32)
}

function deriveDeviceId(publicKeyPem: string): string {
  const raw = derivePublicKeyRaw(publicKeyPem)
  return createHash('sha256').update(raw).digest('hex')
}

function base64urlEncode(buf: Buffer): string {
  return buf.toString('base64url')
}

function generateIdentity(): DeviceIdentity {
  const { privateKey, publicKey } = (() => {
    const { generateKeyPairSync } = require('node:crypto')
    return generateKeyPairSync('ed25519') as { privateKey: import('node:crypto').KeyObject; publicKey: import('node:crypto').KeyObject }
  })()
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string
  const deviceId = deriveDeviceId(publicKeyPem)
  return { deviceId, publicKeyPem, privateKeyPem }
}

function writeIdentity(path: string, identity: DeviceIdentity): void {
  mkdirSync(dirname(path), { recursive: true })
  const payload = {
    version: 1,
    deviceId: identity.deviceId,
    publicKeyPem: identity.publicKeyPem,
    privateKeyPem: identity.privateKeyPem,
    createdAtMs: Date.now(),
  }
  writeFileSync(path, JSON.stringify(payload, null, 2) + '\n', { mode: 0o600 })
}

export function loadOrCreateDeviceIdentity(): DeviceIdentity {
  const path = getIdentityPath()
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    const deviceId = String(raw.deviceId ?? '').trim()
    const publicKeyPem = String(raw.publicKeyPem ?? '').trim()
    const privateKeyPem = String(raw.privateKeyPem ?? '').trim()
    if (deviceId && publicKeyPem && privateKeyPem) {
      const derivedId = deriveDeviceId(publicKeyPem)
      const identity = { deviceId: derivedId, publicKeyPem, privateKeyPem }
      if (derivedId !== deviceId) writeIdentity(path, identity)
      return identity
    }
  } catch {
    // fall through to generate
  }
  const identity = generateIdentity()
  writeIdentity(path, identity)
  return identity
}

export function publicKeyRawBase64url(publicKeyPem: string): string {
  return base64urlEncode(derivePublicKeyRaw(publicKeyPem))
}

export function buildDeviceAuthPayload(params: {
  deviceId: string
  clientId: string
  clientMode: string
  role: string
  scopes: string[]
  signedAtMs: number
  token: string
  nonce: string | null
}): string {
  const version = params.nonce ? 'v2' : 'v1'
  const parts = [
    version,
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(','),
    String(params.signedAtMs),
    params.token,
  ]
  if (params.nonce) parts.push(params.nonce)
  return parts.join('|')
}

export function signDevicePayload(privateKeyPem: string, payloadStr: string): string {
  const key = createPrivateKey(privateKeyPem)
  const sig = cryptoSign(null, Buffer.from(payloadStr, 'utf-8'), key)
  return base64urlEncode(sig as Buffer)
}
