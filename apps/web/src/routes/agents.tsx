import { createFileRoute } from '@tanstack/react-router'
import { useAgents, type Agent } from '@/hooks/api/agents'
import { Loader2 } from 'lucide-react'

export const Route = createFileRoute('/agents')({
  component: AgentsPage,
})

const STATUS_DOT: Record<Agent['status'], string> = {
  online: 'bg-[#3fb950]',
  offline: 'bg-[#6e7681]',
  unknown: 'bg-[#d29922]',
}

const STATUS_LABEL: Record<Agent['status'], string> = {
  online: 'online',
  offline: 'offline',
  unknown: 'unknown',
}

const STATUS_TEXT: Record<Agent['status'], string> = {
  online: 'text-[#3fb950]',
  offline: 'text-[#6e7681]',
  unknown: 'text-[#d29922]',
}

function AgentCard({ agent }: { agent: Agent }) {
  return (
    <div className="border border-[#30363d] bg-[#161b22] p-4 flex flex-col gap-3 hover:border-[#58a6ff]/40 transition-colors">
      {/* header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 flex items-center justify-center bg-[#21262d] border border-[#30363d] text-xl flex-shrink-0">
            {agent.emoji ?? '🤖'}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-[#e6edf3] truncate">{agent.name}</p>
            <p className="font-mono text-[10px] text-[#6e7681] truncate">{agent.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[agent.status]}`} />
          <span className={`font-mono text-xs ${STATUS_TEXT[agent.status]}`}>
            {STATUS_LABEL[agent.status]}
          </span>
        </div>
      </div>

      {/* model info */}
      <div className="flex flex-col gap-1.5 border-t border-[#21262d] pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">model</span>
          <span className="font-mono text-xs text-[#8b949e] truncate max-w-[60%] text-right">
            {agent.primaryModel ?? '—'}
          </span>
        </div>

        {agent.fallbackModels && agent.fallbackModels.length > 0 && (
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">fallback</span>
            <span className="font-mono text-xs text-[#6e7681] truncate max-w-[60%] text-right">
              {agent.fallbackModels[0]}{agent.fallbackModels.length > 1 ? ` +${agent.fallbackModels.length - 1}` : ''}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">sessions</span>
          <span className={`font-mono text-xs ${(agent.sessionCount ?? 0) > 0 ? 'text-[#3fb950]' : 'text-[#6e7681]'}`}>
            {agent.sessionCount ?? 0}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">heartbeat</span>
          <span className={`font-mono text-xs ${agent.hasHeartbeat ? 'text-[#3fb950]' : 'text-[#6e7681]'}`}>
            {agent.hasHeartbeat ? 'yes' : 'no'}
          </span>
        </div>
      </div>
    </div>
  )
}

function AgentsPage() {
  const { data: agents, isLoading } = useAgents()

  const online = (agents ?? []).filter((a) => a.status === 'online').length
  const total = (agents ?? []).length

  return (
    <div className="flex flex-col gap-6">
      {/* header */}
      <div className="flex items-center justify-between pb-4 border-b border-[#21262d]">
        <h1 className="font-mono text-[13px] font-semibold text-[#e6edf3] tracking-wide uppercase flex items-center gap-2">
          <span className="text-[#58a6ff]">~/</span>agents
        </h1>
        {!isLoading && agents && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#3fb950]" />
            <span className="font-mono text-xs text-[#8b949e]">
              {online}/{total} online
            </span>
          </div>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-[#58a6ff]" />
        </div>
      )}

      {!isLoading && (agents ?? []).length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-[#6e7681]">
          <span className="font-mono text-4xl opacity-20">[]</span>
          <span className="font-mono text-sm">no agents configured</span>
          <span className="font-mono text-xs text-[#30363d]">check openclaw.json agents list</span>
        </div>
      )}

      {!isLoading && (agents ?? []).length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {(agents ?? []).map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  )
}
