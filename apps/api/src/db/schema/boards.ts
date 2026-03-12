import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const boards = pgTable('boards', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  gatewayAgentId: text('gateway_agent_id'),
  requireApprovalForDone: boolean('require_approval_for_done').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
