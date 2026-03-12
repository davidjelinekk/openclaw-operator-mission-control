import { jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'

export const skillSnapshots = pgTable('skill_snapshots', {
  skillId: text('skill_id').primaryKey(),
  displayName: text('display_name').notNull(),
  description: text('description'),
  skillType: text('skill_type').notNull().default('skill'),
  isInstalled: text('is_installed').notNull().default('true'),
  configJson: jsonb('config_json'),
  requiredEnv: jsonb('required_env').notNull().default([]),
  dependencies: jsonb('dependencies').notNull().default([]),
  scannedAt: timestamp('scanned_at', { withTimezone: true }).notNull().defaultNow(),
})

export const agentSkills = pgTable(
  'agent_skills',
  {
    agentId: text('agent_id').notNull(),
    skillId: text('skill_id').notNull().references(() => skillSnapshots.skillId, { onDelete: 'cascade' }),
  },
  (t) => [unique().on(t.agentId, t.skillId)],
)
