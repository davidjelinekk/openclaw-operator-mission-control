import { z } from 'zod'
import { homedir } from 'node:os'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3001),
  OPERATOR_TOKEN: z.string().min(1),
  DATABASE_URL: z.string().url().default('postgresql://localhost:5432/oc_operator'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379/2'),
  OPENCLAW_HOME: z.string().default(join(homedir(), '.openclaw')),
  GATEWAY_URL: z.string().default('ws://127.0.0.1:18789'),
  GATEWAY_TOKEN: z.string().default(''),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

function loadOpenclawGatewayToken(openclawHome: string): string {
  try {
    const configPath = join(openclawHome, 'openclaw.json')
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    return config?.gateway?.auth?.token ?? ''
  } catch {
    return ''
  }
}

const raw = EnvSchema.parse(process.env)

const openclawHome = raw.OPENCLAW_HOME
const gatewayToken = raw.GATEWAY_TOKEN || loadOpenclawGatewayToken(openclawHome)

export const config = {
  ...raw,
  GATEWAY_TOKEN: gatewayToken,
} as const
