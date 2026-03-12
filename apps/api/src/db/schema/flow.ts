import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { tasks } from './tasks.js'

export const agentFlowEdges = pgTable(
  'agent_flow_edges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fromAgentId: text('from_agent_id').notNull(),
    toAgentId: text('to_agent_id').notNull(),
    messageType: text('message_type').notNull(),
    sessionId: text('session_id'),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    tokenCost: text('token_cost'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    rawLogLine: text('raw_log_line'),
  },
  (t) => [
    index('idx_flow_from_agent').on(t.fromAgentId, t.occurredAt),
    index('idx_flow_to_agent').on(t.toAgentId, t.occurredAt),
  ],
)
