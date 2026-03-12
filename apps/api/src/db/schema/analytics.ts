import { index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { tasks } from './tasks.js'
import { projects } from './projects.js'

export const tokenEvents = pgTable(
  'token_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: text('agent_id').notNull(),
    sessionId: text('session_id').notNull(),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    provider: text('provider').notNull(),
    modelId: text('model_id').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
    costUsd: text('cost_usd').notNull().default('0'),
    turnTimestamp: timestamp('turn_timestamp', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_token_events_agent_turn').on(t.agentId, t.turnTimestamp),
    index('idx_token_events_session').on(t.sessionId),
    index('idx_token_events_project').on(t.projectId),
  ],
)

export const analyticsWatermarks = pgTable(
  'analytics_watermarks',
  {
    agentId: text('agent_id').notNull(),
    sessionId: text('session_id').notNull(),
    byteOffset: integer('byte_offset').notNull().default(0),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.agentId, t.sessionId)],
)
