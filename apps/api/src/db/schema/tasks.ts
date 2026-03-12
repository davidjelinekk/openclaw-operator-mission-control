import { boolean, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { boards } from './boards.js'
import { projects } from './projects.js'

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  boardId: uuid('board_id').notNull().references(() => boards.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('inbox'),
  priority: text('priority').notNull().default('medium'),
  assignedAgentId: text('assigned_agent_id'),
  dueAt: timestamp('due_at', { withTimezone: true }),
  inProgressAt: timestamp('in_progress_at', { withTimezone: true }),
  autoCreated: boolean('auto_created').notNull().default(false),
  autoReason: text('auto_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const taskDependencies = pgTable(
  'task_dependencies',
  {
    taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    dependsOnTaskId: uuid('depends_on_task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  },
  (t) => [unique().on(t.taskId, t.dependsOnTaskId)],
)

export const approvals = pgTable('approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  boardId: uuid('board_id').notNull().references(() => boards.id, { onDelete: 'cascade' }),
  taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
  agentId: text('agent_id').notNull(),
  actionType: text('action_type').notNull(),
  payload: jsonb('payload'),
  confidence: text('confidence'),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
})
