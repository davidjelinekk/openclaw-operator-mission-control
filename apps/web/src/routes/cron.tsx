import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { Play, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { useCronJobs, useTriggerCron, type CronJob, type CronRun } from '@/hooks/api/cron'
import { AgentChip } from '@/components/atoms/AgentChip'

export const Route = createFileRoute('/cron')({
  component: CronPage,
})

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatDuration(ms?: number): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function countdown(iso?: string): string {
  if (!iso) return '—'
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'now'
  const secs = Math.floor(diff / 1000)
  const mins = Math.floor(secs / 60)
  const remSecs = secs % 60
  if (mins > 0) return `in ${mins}m ${remSecs}s`
  return `in ${secs}s`
}

const STATUS_STYLES: Record<CronJob['status'], string> = {
  ok: 'text-[#3fb950] border-[#238636]',
  error: 'text-[#f85149] border-[#6e0000]',
  timeout: 'text-[#d29922] border-[#9e6a03]',
  running: 'text-[#58a6ff] border-[#1f6feb] animate-pulse',
  disabled: 'text-[#6e7681] border-[#30363d]',
}

const RUN_STATUS_STYLES: Record<CronRun['status'], string> = {
  ok: 'text-[#3fb950] border-[#238636]',
  error: 'text-[#f85149] border-[#6e0000]',
  timeout: 'text-[#d29922] border-[#9e6a03]',
}

function StatusBadge({ status }: { status: CronJob['status'] }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-xs font-mono border ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  )
}

function RunStatusBadge({ status }: { status: CronRun['status'] }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-xs font-mono border ${RUN_STATUS_STYLES[status]}`}>
      {status}
    </span>
  )
}

function CountdownCell({ nextRunAt }: { nextRunAt?: string }) {
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  return <span className="font-mono text-[#8b949e]">{countdown(nextRunAt)}</span>
}

function CronRow({ job }: { job: CronJob }) {
  const [expanded, setExpanded] = useState(false)
  const [triggering, setTriggering] = useState(false)
  const trigger = useTriggerCron()

  const runs = job.recentRuns?.slice(0, 5) ?? []

  return (
    <>
      <tr
        className="border-b border-[#21262d] hover:bg-[#161b22] cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <span className="text-[#6e7681] w-4">
              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </span>
            <span className="text-[#e6edf3] font-medium">{job.name}</span>
          </div>
        </td>
        <td className="py-3 px-4 font-mono text-xs text-[#8b949e]">{job.schedule}</td>
        <td className="py-3 px-4">
          {job.agentId ? (
            <AgentChip emoji="🤖" name={job.agentId} />
          ) : (
            <span className="text-[#6e7681]">—</span>
          )}
        </td>
        <td className="py-3 px-4 font-mono text-xs text-[#8b949e]">
          {job.lastRunAt ? relativeTime(job.lastRunAt) : '—'}
        </td>
        <td className="py-3 px-4 font-mono text-sm text-[#8b949e]">
          {formatDuration(job.lastDurationMs)}
        </td>
        <td className="py-3 px-4">
          <StatusBadge status={job.status} />
        </td>
        <td className="py-3 px-4">
          {job.consecutiveErrors > 0 ? (
            <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-mono border border-[#6e0000] text-[#f85149]">
              {job.consecutiveErrors} err{job.consecutiveErrors !== 1 ? 's' : ''}
            </span>
          ) : (
            <span className="text-[#6e7681]">—</span>
          )}
        </td>
        <td className="py-3 px-4 text-sm">
          <CountdownCell nextRunAt={job.nextRunAt} />
        </td>
        <td className="py-3 px-4">
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (triggering) return
              setTriggering(true)
              trigger.mutate(job.id, { onSettled: () => setTriggering(false) })
            }}
            disabled={triggering}
            className="flex items-center gap-1.5 px-2 py-1 text-xs border border-[#30363d] bg-[#21262d] text-[#e6edf3] hover:bg-[#30363d] transition-colors disabled:opacity-50"
          >
            {triggering ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Play className="w-3 h-3" />
            )}
            Run
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-[#21262d] bg-[#0d1117]">
          <td colSpan={9} className="px-12 py-3">
            {runs.length === 0 ? (
              <p className="text-sm text-[#6e7681] py-2">No recent runs recorded.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-medium uppercase tracking-wider text-[#6e7681]">
                    <th className="text-left pb-1">Run At</th>
                    <th className="text-left pb-1">Duration</th>
                    <th className="text-left pb-1">Status</th>
                    <th className="text-left pb-1">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r, i) => (
                    <tr key={i} className="border-t border-[#21262d]">
                      <td className="py-1.5 font-mono text-xs text-[#8b949e] pr-6">{new Date(r.runAt).toLocaleString()}</td>
                      <td className="py-1.5 font-mono text-xs text-[#8b949e] pr-6">{formatDuration(r.durationMs)}</td>
                      <td className="py-1.5 pr-6">
                        <RunStatusBadge status={r.status} />
                      </td>
                      <td className="py-1.5 text-[#f85149] text-xs font-mono">{r.errorMessage ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function CronPage() {
  const { data: jobs, isLoading, dataUpdatedAt } = useCronJobs()
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const lastRefresh = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '—'

  return (
    <div className="p-6">
      <div className="flex items-center justify-between pb-4 mb-5 border-b border-[#21262d]">
        <h1 className="font-mono text-[13px] font-semibold text-[#e6edf3] tracking-wide uppercase flex items-center gap-2">
          <span className="text-[#58a6ff]">~/</span>cron
        </h1>
        <p className="text-xs font-mono text-[#6e7681]">Last refreshed {lastRefresh}</p>
      </div>

      {isLoading && (
        <div className="text-center py-16 text-[#6e7681]">Loading cron jobs…</div>
      )}

      {!isLoading && (
        <div className="border border-[#30363d] bg-[#161b22] overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-medium uppercase tracking-wider text-[#8b949e] border-b border-[#30363d] bg-[#161b22]">
                <th className="text-left px-4 py-3">Job Name</th>
                <th className="text-left px-4 py-3">Schedule</th>
                <th className="text-left px-4 py-3">Agent</th>
                <th className="text-left px-4 py-3">Last Run</th>
                <th className="text-left px-4 py-3">Duration</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Errors</th>
                <th className="text-left px-4 py-3">Next Run</th>
                <th className="text-left px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(jobs ?? []).map((job) => (
                <CronRow key={job.id} job={job} />
              ))}
              {(jobs ?? []).length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-[#6e7681]">No cron jobs configured</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
