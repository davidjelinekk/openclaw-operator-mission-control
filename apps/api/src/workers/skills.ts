import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { db } from '../db/client.js'
import { skillSnapshots } from '../db/schema.js'
import { config } from '../config.js'

interface SkillEntry {
  skillId: string
  displayName: string
  description: string | null
  skillType: string
  isInstalled: boolean
  configJson: unknown
  requiredEnv: string[]
  dependencies: string[]
}

function parseSkillMd(content: string): { displayName: string; description: string | null } {
  const lines = content.split('\n')
  const h1 = lines.find((l) => l.startsWith('# '))
  const displayName = h1 ? h1.slice(2).trim() : 'Unknown Skill'
  const descLines = lines.slice(1).filter((l) => l.trim() && !l.startsWith('#')).slice(0, 3)
  const description = descLines.join(' ').trim() || null
  return { displayName, description }
}

async function runRefresh(): Promise<void> {
  const skillsDir = join(config.OPENCLAW_HOME, 'skills')
  const entries: SkillEntry[] = []

  let skillDirs: string[] = []
  try {
    skillDirs = readdirSync(skillsDir)
  } catch (e) {
    console.error('[skills] failed to read skills dir:', e)
    return
  }

  for (const skillId of skillDirs) {
    const skillDir = join(skillsDir, skillId)
    let displayName = skillId
    let description: string | null = null
    let requiredEnv: string[] = []

    const skillMdPath = join(skillDir, 'SKILL.md')
    if (existsSync(skillMdPath)) {
      const content = readFileSync(skillMdPath, 'utf-8')
      const parsed = parseSkillMd(content)
      displayName = parsed.displayName
      description = parsed.description

      // Extract required env vars from SKILL.md
      const envMatches = content.match(/`([A-Z_]+_[A-Z_]+)`/g) ?? []
      requiredEnv = [...new Set(envMatches.map((m) => m.replace(/`/g, '')))]
    }

    const manifestPath = join(skillDir, 'manifest.json')
    let configJson: unknown = null
    if (existsSync(manifestPath)) {
      try {
        configJson = JSON.parse(readFileSync(manifestPath, 'utf-8'))
      } catch (e) {
        console.error(`[skills] failed to parse manifest for ${skillId}:`, e)
      }
    }

    entries.push({
      skillId,
      displayName,
      description,
      skillType: 'skill',
      isInstalled: true,
      configJson,
      requiredEnv,
      dependencies: [],
    })
  }

  // Also read MCP servers from openclaw.json
  try {
    const oclawConfig = JSON.parse(readFileSync(join(config.OPENCLAW_HOME, 'openclaw.json'), 'utf-8'))
    const mcpServers = oclawConfig?.mcpServers ?? {}
    for (const [serverId, serverConfig] of Object.entries(mcpServers)) {
      entries.push({
        skillId: `mcp:${serverId}`,
        displayName: serverId,
        description: `MCP Server: ${serverId}`,
        skillType: 'mcp_server',
        isInstalled: true,
        configJson: serverConfig,
        requiredEnv: [],
        dependencies: [],
      })
    }
  } catch (e) {
    console.error('[skills] failed to read openclaw.json MCP servers:', e)
  }

  for (const entry of entries) {
    await db.insert(skillSnapshots).values({
      skillId: entry.skillId,
      displayName: entry.displayName,
      description: entry.description,
      skillType: entry.skillType,
      isInstalled: entry.isInstalled,
      configJson: entry.configJson,
      requiredEnv: entry.requiredEnv as unknown as never,
      dependencies: entry.dependencies as unknown as never,
      scannedAt: new Date(),
    }).onConflictDoUpdate({
      target: skillSnapshots.skillId,
      set: {
        displayName: entry.displayName,
        description: entry.description,
        configJson: entry.configJson,
        requiredEnv: entry.requiredEnv as unknown as never,
        scannedAt: new Date(),
      },
    })
  }

}

export const skillsRefreshWorker = {
  run: runRefresh,
}
