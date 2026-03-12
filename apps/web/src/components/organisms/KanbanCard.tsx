import { cn } from '@/lib/utils'
import type { Task } from '@/hooks/api/boards'
import type { Agent } from '@/hooks/api/agents'

interface KanbanCardProps {
  task: Task
  agents?: Agent[]
  isDragging?: boolean
  onClick?: () => void
}

const priorityBadge: Record<Task['priority'], { label: string; className: string; borderLeft: string }> = {
  high: { label: 'HIGH', className: 'text-[#f85149] border border-[#6e0000]', borderLeft: 'border-l-2 border-l-[#f85149]' },
  medium: { label: 'MED', className: 'text-[#d29922] border border-[#9e6a03]', borderLeft: 'border-l-2 border-l-[#d29922]' },
  low: { label: 'LOW', className: 'text-[#8b949e] border border-[#30363d]', borderLeft: 'border-l-2 border-l-[#30363d]' },
}

function formatRelativeDate(dateStr: string): { label: string; overdue: boolean } {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  const overdue = diffMs < 0

  if (overdue) {
    const abs = Math.abs(diffDays)
    return { label: abs === 0 ? 'Today' : `${abs}d overdue`, overdue: true }
  }
  if (diffDays === 0) return { label: 'Today', overdue: false }
  if (diffDays === 1) return { label: 'Tomorrow', overdue: false }
  return { label: `in ${diffDays}d`, overdue: false }
}

export function KanbanCard({ task, agents, isDragging, onClick }: KanbanCardProps) {
  const priority = priorityBadge[task.priority]
  const assignedAgent = task.assignedAgentId ? agents?.find((a) => a.id === task.assignedAgentId) : undefined
  const dueDateInfo = task.dueDate ? formatRelativeDate(task.dueDate) : null

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-[#161b22] border border-[#30363d] p-3 cursor-pointer select-none',
        priority.borderLeft,
        'hover:border-[#58a6ff] transition-colors',
        isDragging && 'opacity-50',
      )}
    >
      <p className="text-sm text-[#e6edf3] font-medium line-clamp-2 leading-snug mb-2">{task.title}</p>

      <div className="flex flex-wrap gap-1.5 items-center">
        <span className={cn('text-[10px] font-mono font-semibold px-1.5 py-0.5', priority.className)}>
          {priority.label}
        </span>

        {task.depCount != null && task.depCount > 0 && (
          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 text-[#8b949e] border border-[#30363d]">
            BLOCKED
          </span>
        )}

        {task.pendingApproval && (
          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 text-[#d29922] border border-[#9e6a03]">
            APPROVAL
          </span>
        )}
      </div>

      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {task.tags.slice(0, 3).map((tag) => (
            <span
              key={tag.id}
              className="text-[9px] font-mono px-1 py-0.5 border"
              style={{ color: `#${tag.color}`, borderColor: `#${tag.color}33` }}
            >
              {tag.name}
            </span>
          ))}
          {task.tags.length > 3 && (
            <span className="text-[9px] font-mono text-[#6e7681]">+{task.tags.length - 3}</span>
          )}
        </div>
      )}

      {(assignedAgent || dueDateInfo) && (
        <div className="flex items-center justify-between mt-2 gap-2">
          {assignedAgent ? (
            <span className="inline-flex items-center gap-1 text-xs text-[#8b949e] bg-[#0d1117] border border-[#30363d] px-1.5 py-0.5 truncate max-w-[120px] font-mono">
              <span>{assignedAgent.emoji ?? '🤖'}</span>
              <span className="truncate">{assignedAgent.name}</span>
            </span>
          ) : (
            <span />
          )}

          {dueDateInfo && (
            <span className={cn('text-[11px] font-mono font-medium flex-shrink-0', dueDateInfo.overdue ? 'text-[#f85149]' : 'text-[#6e7681]')}>
              {dueDateInfo.label}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
