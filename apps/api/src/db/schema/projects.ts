import { index, integer, pgTable, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull().default('planning'),
  progressPct: smallint('progress_pct').notNull().default(0),
  targetDate: timestamp('target_date', { withTimezone: true }),
  orchestratorAgentId: text('orchestrator_agent_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const projectTasks = pgTable(
  'project_tasks',
  {
    projectId: uuid('project_id').notNull(),
    taskId: uuid('task_id').notNull(),
    position: integer('position').notNull().default(0),
    executionMode: text('execution_mode').notNull().default('sequential'),
  },
  (t) => [
    unique().on(t.projectId, t.taskId),
    index('idx_project_tasks_position').on(t.projectId, t.position),
  ],
)

export const projectTaskDeps = pgTable(
  'project_task_deps',
  {
    projectId: uuid('project_id').notNull(),
    taskId: uuid('task_id').notNull(),
    dependsOnTaskId: uuid('depends_on_task_id').notNull(),
  },
  (t) => [unique().on(t.projectId, t.taskId, t.dependsOnTaskId)],
)
