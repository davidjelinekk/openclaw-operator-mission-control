import { z } from 'zod'

export const AgentStatusSchema = z.enum(['online', 'idle', 'offline', 'error'])
export type AgentStatus = z.infer<typeof AgentStatusSchema>

export const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  emoji: z.string().optional(),
  theme: z.string().optional(),
  status: AgentStatusSchema,
  primaryModel: z.string(),
  fallbackModels: z.array(z.string()),
  hasHeartbeat: z.boolean(),
  sessionCount: z.number().int(),
})
export type Agent = z.infer<typeof AgentSchema>
