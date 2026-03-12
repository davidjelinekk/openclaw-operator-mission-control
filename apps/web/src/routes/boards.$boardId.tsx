import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef, useEffect } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertTriangle, CheckCircle2, Clock, Plus, Settings, X, ChevronRight, MessageSquare, ShieldCheck } from 'lucide-react'
import { useBoard } from '@/hooks/useBoard'
import { useCreateTask, useUpdateTask, useDeleteTask, useAddDep, useRemoveDep, useTaskNotes, useCreateTaskNote } from '@/hooks/api/tasks'
import { useAgents } from '@/hooks/api/agents'
import { useQuery } from '@tanstack/react-query'
import { api, queryClient } from '@/lib/api'
import { KanbanCard } from '@/components/organisms/KanbanCard'
import { cn } from '@/lib/utils'
import type { Task, BoardSnapshot } from '@/hooks/api/boards'
import type { TaskDep, TaskDeps } from '@/hooks/api/tasks'
import { useActivity, useCreateActivity } from '@/hooks/api/activity'
import { useTags, useTaskTags, useAddTagToTask, useRemoveTagFromTask } from '@/hooks/api/tags'
import { useApprovals, useUpdateApproval, type Approval as ApprovalFull } from '@/hooks/api/approvals'

export const Route = createFileRoute('/boards/$boardId')({
  component: BoardDetailPage,
})

type Status = Task['status']

const COLUMNS: { id: Status; label: string }[] = [
  { id: 'inbox', label: 'INBOX' },
  { id: 'in_progress', label: 'IN PROGRESS' },
  { id: 'review', label: 'REVIEW' },
  { id: 'done', label: 'DONE' },
]

// ─── Sortable card wrapper ────────────────────────────────────────────────────

function SortableCard({
  task,
  agents,
  onOpen,
}: {
  task: Task
  agents: ReturnType<typeof useAgents>['data']
  onOpen: (task: Task) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <KanbanCard task={task} agents={agents} isDragging={isDragging} onClick={() => onOpen(task)} />
    </div>
  )
}

// ─── Add task form ────────────────────────────────────────────────────────────

function AddTaskForm({ boardId, status, onDone }: { boardId: string; status: Status; onDone: () => void }) {
  const createTask = useCreateTask(boardId)
  const [title, setTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && title.trim()) {
      await createTask.mutateAsync({ title: title.trim(), status, priority: 'medium' })
      setTitle('')
      onDone()
    }
    if (e.key === 'Escape') onDone()
  }

  return (
    <div className="mt-2">
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onDone}
        placeholder="Task title… (Enter to save)"
        className="w-full bg-[#0d1117] border border-[#58a6ff] px-3 py-2 text-sm text-[#e6edf3] placeholder-[#6e7681] focus:outline-none"
      />
    </div>
  )
}

// ─── Column ───────────────────────────────────────────────────────────────────

type ReviewFilter = 'all' | 'approval' | 'blocked'

function KanbanColumn({
  col,
  tasks,
  boardId,
  agents,
  isOver,
  onOpenTask,
}: {
  col: { id: Status; label: string }
  tasks: Task[]
  boardId: string
  agents: ReturnType<typeof useAgents>['data']
  isOver: boolean
  onOpenTask: (task: Task) => void
}) {
  const [adding, setAdding] = useState(false)
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all')

  const visibleTasks = col.id === 'review'
    ? tasks.filter((t) => {
        if (reviewFilter === 'approval') return t.pendingApproval === true
        if (reviewFilter === 'blocked') return (t.depCount ?? 0) > 0
        return true
      })
    : tasks

  return (
    <div
      className={cn(
        'flex flex-col bg-[#0d1117] border transition-colors min-w-0',
        isOver ? 'border-[#58a6ff]' : 'border-[#30363d]',
      )}
    >
      <div className="flex items-center justify-between px-4 py-3 bg-[#161b22] border-b border-[#30363d]">
        <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[#8b949e]">{col.label}</span>
        <span className="text-xs font-mono bg-[#0d1117] border border-[#30363d] text-[#6e7681] px-1.5 py-0.5">
          {tasks.length}
        </span>
      </div>

      {col.id === 'review' && (
        <div className="flex border-b border-[#21262d] px-2 pt-1.5 bg-[#161b22]">
          {(['all', 'approval', 'blocked'] as ReviewFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setReviewFilter(f)}
              className={cn(
                'px-2 pb-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors',
                reviewFilter === f
                  ? 'text-[#58a6ff] border-b border-[#58a6ff]'
                  : 'text-[#6e7681] hover:text-[#8b949e]',
              )}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[120px]">
        <SortableContext items={visibleTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {visibleTasks.map((task) => (
            <SortableCard key={task.id} task={task} agents={agents} onOpen={onOpenTask} />
          ))}
        </SortableContext>
        {adding && (
          <AddTaskForm boardId={boardId} status={col.id} onDone={() => setAdding(false)} />
        )}
      </div>

      <div className="px-2 pb-2">
        <button
          onClick={() => setAdding(true)}
          className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-[#6e7681] hover:text-[#8b949e] hover:bg-[#161b22] transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add task
        </button>
      </div>
    </div>
  )
}

// ─── Task detail sheet tabs ───────────────────────────────────────────────────

function DetailTab({ task, agents, onClose }: { task: Task; agents: ReturnType<typeof useAgents>['data']; onClose: () => void }) {
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [priority, setPriority] = useState(task.priority)
  const [assignedAgentId, setAssignedAgentId] = useState(task.assignedAgentId ?? '')
  const [dueDate, setDueDate] = useState(task.dueDate ? task.dueDate.slice(0, 10) : '')
  const [outcome, setOutcome] = useState<Task['outcome']>(task.outcome ?? null)

  async function handleSave() {
    await updateTask.mutateAsync({
      id: task.id,
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      assignedAgentId: assignedAgentId || undefined,
      dueDate: dueDate || undefined,
      outcome: outcome ?? undefined,
    })
  }

  async function handleDelete() {
    if (!confirm('Delete this task?')) return
    await deleteTask.mutateAsync({ id: task.id, boardId: task.boardId })
    onClose()
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium uppercase tracking-wider text-[#8b949e] mb-1">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-[#0d1117] border border-[#30363d] px-3 py-2 text-sm text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
        />
      </div>
      <div>
        <label className="block text-xs font-medium uppercase tracking-wider text-[#8b949e] mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full bg-[#0d1117] border border-[#30363d] px-3 py-2 text-sm text-[#e6edf3] focus:outline-none focus:border-[#58a6ff] resize-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-[#8b949e] mb-1">Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Task['priority'])}
            className="w-full bg-[#0d1117] border border-[#30363d] px-3 py-2 text-sm text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-[#8b949e] mb-1">Due Date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full bg-[#0d1117] border border-[#30363d] px-3 py-2 text-sm text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
          />
        </div>
      </div>
      {agents && (
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-[#8b949e] mb-1">Assignee</label>
          <select
            value={assignedAgentId}
            onChange={(e) => setAssignedAgentId(e.target.value)}
            className="w-full bg-[#0d1117] border border-[#30363d] px-3 py-2 text-sm text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
          >
            <option value="">Unassigned</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.emoji ? `${a.emoji} ` : ''}{a.name}</option>
            ))}
          </select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-[#8b949e] mb-1">Outcome</label>
          <select
            value={outcome ?? ''}
            onChange={(e) => setOutcome((e.target.value as Task['outcome']) || null)}
            className={cn(
              'w-full bg-[#0d1117] border border-[#30363d] px-3 py-2 text-sm focus:outline-none focus:border-[#58a6ff]',
              outcome === 'success' && 'text-[#3fb950]',
              outcome === 'failed' && 'text-[#f85149]',
              outcome === 'partial' && 'text-[#d29922]',
              outcome === 'abandoned' && 'text-[#6e7681]',
              !outcome && 'text-[#e6edf3]',
            )}
          >
            <option value="">None</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="partial">Partial</option>
            <option value="abandoned">Abandoned</option>
          </select>
        </div>
        {task.completedAt && (
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-[#8b949e] mb-1">Completed</label>
            <p className="px-3 py-2 text-sm font-mono text-[#8b949e] bg-[#0d1117] border border-[#30363d]">
              {new Date(task.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={handleDelete}
          className="text-xs text-[#f85149] hover:text-[#ff7b72] transition-colors"
        >
          Delete task
        </button>
        <button
          onClick={handleSave}
          disabled={updateTask.isPending}
          className="px-3 py-1.5 text-sm font-medium bg-[#1f6feb] border border-[#388bfd] text-white hover:bg-[#388bfd] disabled:opacity-50 transition-colors"
        >
          {updateTask.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function DepsTab({ task, snapshot }: { task: Task; snapshot: BoardSnapshot }) {
  const addDep = useAddDep()
  const removeDep = useRemoveDep()
  const [search, setSearch] = useState('')

  const { data: deps, refetch: refetchDeps } = useQuery<TaskDeps>({
    queryKey: ['task', task.id, 'deps'],
    queryFn: () => api.get(`api/tasks/${task.id}/deps`).json<TaskDeps>(),
  })

  const matchingTasks = snapshot.tasks.filter(
    (t) =>
      t.id !== task.id &&
      !deps?.blockedBy.some((d) => d.dependsOnTaskId === t.id) &&
      t.title.toLowerCase().includes(search.toLowerCase()),
  )

  async function handleAddDep(dependsOnTaskId: string) {
    await addDep.mutateAsync({ taskId: task.id, dependsOnTaskId })
    refetchDeps()
    setSearch('')
    queryClient.invalidateQueries({ queryKey: ['board', task.boardId, 'snapshot'] })
  }

  async function handleRemoveDep(depId: string) {
    await removeDep.mutateAsync({ taskId: task.id, depId })
    refetchDeps()
    queryClient.invalidateQueries({ queryKey: ['board', task.boardId, 'snapshot'] })
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-[#8b949e] mb-2">Blocked by</p>
        {!deps || deps.blockedBy.length === 0 ? (
          <p className="text-xs text-[#6e7681] italic">No dependencies</p>
        ) : (
          <div className="space-y-1.5">
            {deps.blockedBy.map((dep) => {
              const depTask = snapshot.tasks.find((t) => t.id === dep.dependsOnTaskId)
              return (
                <div key={dep.id} className="flex items-center justify-between bg-[#0d1117] border border-[#30363d] px-3 py-2">
                  <span className="text-sm text-[#e6edf3] truncate">{depTask?.title ?? dep.dependsOnTaskId}</span>
                  <button
                    onClick={() => handleRemoveDep(dep.id)}
                    className="text-[#6e7681] hover:text-[#f85149] ml-2 flex-shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-[#8b949e] mb-2">Add dependency</p>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks…"
          className="w-full bg-[#0d1117] border border-[#30363d] px-3 py-2 text-sm text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:border-[#58a6ff] mb-2"
        />
        {search && matchingTasks.length > 0 && (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {matchingTasks.slice(0, 8).map((t) => (
              <button
                key={t.id}
                onClick={() => handleAddDep(t.id)}
                className="w-full text-left flex items-center gap-2 bg-[#0d1117] border border-[#30363d] hover:border-[#58a6ff] px-3 py-2 text-sm text-[#e6edf3] transition-colors"
              >
                <ChevronRight className="h-3.5 w-3.5 text-[#6e7681] flex-shrink-0" />
                <span className="truncate">{t.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Activity/comments tab ────────────────────────────────────────────────────

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

function ActivityTab({ task }: { task: Task }) {
  const { data: events, isLoading } = useActivity({ taskId: task.id })
  const createActivity = useCreateActivity()
  const [comment, setComment] = useState('')

  async function submitComment(e: React.FormEvent) {
    e.preventDefault()
    if (!comment.trim()) return
    await createActivity.mutateAsync({
      taskId: task.id,
      boardId: task.boardId,
      eventType: 'task.comment',
      message: comment.trim(),
    })
    setComment('')
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {isLoading && <p className="text-xs text-[#6e7681]">loading…</p>}
      {!isLoading && (events ?? []).length === 0 && (
        <p className="text-xs font-mono text-[#6e7681]">No comments yet</p>
      )}
      <div className="space-y-3 flex-1">
        {(events ?? []).map((ev) => (
          <div key={ev.id} className="flex gap-2">
            <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#58a6ff] mt-1.5" />
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                {ev.agentId && <span className="text-[10px] font-mono text-[#6e7681]">{ev.agentId}</span>}
                <span className="text-[10px] font-mono text-[#6e7681]">{relativeTime(ev.createdAt)}</span>
              </div>
              <p className="text-sm text-[#e6edf3]">{ev.message}</p>
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={submitComment} className="flex gap-2 pt-2 border-t border-[#30363d]">
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add comment…"
          className="flex-1 bg-[#0d1117] border border-[#30363d] px-3 py-2 text-sm font-mono text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:border-[#58a6ff]"
        />
        <button
          type="submit"
          disabled={!comment.trim() || createActivity.isPending}
          className="px-3 py-2 text-xs font-mono text-white bg-[#1f6feb] border border-[#388bfd] hover:bg-[#388bfd] disabled:opacity-50 transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  )
}

// ─── Notes tab ───────────────────────────────────────────────────────────────

function NotesTab({ task }: { task: Task }) {
  const { data: notes, isLoading } = useTaskNotes(task.id)
  const createNote = useCreateTaskNote(task.id)
  const [message, setMessage] = useState('')

  async function submitNote(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    await createNote.mutateAsync({ message: message.trim() })
    setMessage('')
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {isLoading && <p className="text-xs text-[#6e7681]">loading…</p>}
      {!isLoading && (notes ?? []).length === 0 && (
        <p className="text-xs font-mono text-[#6e7681]">No notes yet</p>
      )}
      <div className="space-y-3 flex-1">
        {(notes ?? []).map((note) => (
          <div key={note.id} className="flex gap-2">
            <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#d29922] mt-1.5" />
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                {note.agentId && <span className="text-[10px] font-mono text-[#6e7681]">{note.agentId}</span>}
                <span className="text-[10px] font-mono text-[#6e7681]">{relativeTime(note.createdAt)}</span>
              </div>
              <p className="text-sm text-[#e6edf3]">{note.message}</p>
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={submitNote} className="flex gap-2 pt-2 border-t border-[#30363d]">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Add note…"
          rows={2}
          className="flex-1 bg-[#0d1117] border border-[#30363d] px-3 py-2 text-sm font-mono text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:border-[#58a6ff] resize-none"
        />
        <button
          type="submit"
          disabled={!message.trim() || createNote.isPending}
          className="px-3 py-2 text-xs font-mono text-white bg-[#1f6feb] border border-[#388bfd] hover:bg-[#388bfd] disabled:opacity-50 transition-colors self-end"
        >
          Save
        </button>
      </form>
    </div>
  )
}

// ─── Tags tab ────────────────────────────────────────────────────────────────

function TagsTab({ task }: { task: Task }) {
  const { data: taskTags, isLoading: loadingTaskTags } = useTaskTags(task.id)
  const { data: allTags } = useTags()
  const addTag = useAddTagToTask()
  const removeTag = useRemoveTagFromTask()

  const taskTagIds = new Set((taskTags ?? []).map((t) => t.id))
  const availableTags = (allTags ?? []).filter((t) => !taskTagIds.has(t.id))

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-mono uppercase tracking-wider text-[#8b949e] mb-2">Applied tags</p>
        {loadingTaskTags && <p className="text-xs text-[#6e7681]">loading…</p>}
        {!loadingTaskTags && (taskTags ?? []).length === 0 && (
          <p className="text-xs font-mono text-[#6e7681]">No tags applied</p>
        )}
        <div className="flex flex-wrap gap-2">
          {(taskTags ?? []).map((tag) => {
            const hex = tag.color.startsWith('#') ? tag.color : `#${tag.color}`
            return (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1.5 text-xs font-mono px-2 py-1 border"
                style={{ color: hex, borderColor: `${hex}55` }}
              >
                {tag.name}
                <button
                  onClick={() => removeTag.mutate({ taskId: task.id, tagId: tag.id })}
                  className="opacity-60 hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )
          })}
        </div>
      </div>

      {availableTags.length > 0 && (
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-[#8b949e] mb-2">Add tag</p>
          <div className="flex flex-wrap gap-1.5">
            {availableTags.map((tag) => {
              const hex = tag.color.startsWith('#') ? tag.color : `#${tag.color}`
              return (
                <button
                  key={tag.id}
                  onClick={() => addTag.mutate({ taskId: task.id, tagId: tag.id })}
                  className="text-xs font-mono px-2 py-1 border transition-colors hover:opacity-80"
                  style={{ color: hex, borderColor: `${hex}55` }}
                >
                  + {tag.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Task detail sheet ────────────────────────────────────────────────────────

function TaskDetailSheet({
  task,
  agents,
  snapshot,
  onClose,
}: {
  task: Task
  agents: ReturnType<typeof useAgents>['data']
  snapshot: BoardSnapshot
  onClose: () => void
}) {
  const [tab, setTab] = useState<'detail' | 'deps' | 'activity' | 'tags' | 'notes'>('detail')

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-[#161b22] border-l border-[#30363d] w-[420px] h-full flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363d]">
          <h3 className="text-sm font-semibold text-[#e6edf3] truncate pr-4">{task.title}</h3>
          <button onClick={onClose} className="text-[#6e7681] hover:text-[#e6edf3] transition-colors flex-shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex border-b border-[#30363d]">
          {(['detail', 'deps', 'activity', 'tags', 'notes'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 px-2 py-2.5 text-[10px] font-mono font-medium uppercase tracking-wider transition-colors',
                tab === t
                  ? 'text-[#58a6ff] border-b-2 border-[#58a6ff]'
                  : 'text-[#6e7681] hover:text-[#8b949e]',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'detail' && <DetailTab task={task} agents={agents} onClose={onClose} />}
          {tab === 'deps' && <DepsTab task={task} snapshot={snapshot} />}
          {tab === 'activity' && <ActivityTab task={task} />}
          {tab === 'tags' && <TagsTab task={task} />}
          {tab === 'notes' && <NotesTab task={task} />}
        </div>
      </div>
    </div>
  )
}

// ─── Board chat panel ─────────────────────────────────────────────────────────

function BoardChatPanel({
  boardId,
  boardName,
  gatewayAgentId,
  onClose,
}: {
  boardId: string
  boardName: string
  gatewayAgentId: string | null
  onClose: () => void
}) {
  const { data: events, isLoading } = useActivity({ boardId, eventType: 'board.chat' })
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim() || sending) return
    setSending(true)
    try {
      await api.post(`api/boards/${boardId}/chat`, { json: { message: message.trim() } }).json<unknown>()
      setMessage('')
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-[#161b22] border-l border-[#30363d] w-[380px] h-full flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363d]">
          <div>
            <h3 className="font-mono text-[12px] font-semibold text-[#e6edf3] uppercase tracking-wide">
              <span className="text-[#58a6ff]">~/boards/</span>{boardName}
            </h3>
            <p className="font-mono text-[10px] text-[#6e7681] mt-0.5">board chat</p>
          </div>
          <button onClick={onClose} className="text-[#6e7681] hover:text-[#e6edf3] transition-colors flex-shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!gatewayAgentId ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <p className="font-mono text-xs text-[#6e7681] text-center">
              No gateway agent configured for this board
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {isLoading && <p className="text-xs font-mono text-[#6e7681]">loading…</p>}
              {!isLoading && (events ?? []).length === 0 && (
                <p className="text-xs font-mono text-[#6e7681]">No messages yet</p>
              )}
              {(events ?? []).map((ev) => (
                <div key={ev.id} className="flex gap-2">
                  <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#3fb950] mt-1.5" />
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      {ev.agentId && <span className="text-[10px] font-mono text-[#6e7681]">{ev.agentId}</span>}
                      <span className="text-[10px] font-mono text-[#6e7681]">{relativeTime(ev.createdAt)}</span>
                    </div>
                    <p className="text-sm text-[#e6edf3]">{ev.message}</p>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={handleSend} className="flex gap-2 p-4 border-t border-[#30363d]">
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Message board…"
                className="flex-1 bg-[#0d1117] border border-[#30363d] px-3 py-2 text-sm font-mono text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:border-[#58a6ff]"
              />
              <button
                type="submit"
                disabled={!message.trim() || sending}
                className="px-3 py-2 text-xs font-mono text-white bg-[#1f6feb] border border-[#388bfd] hover:bg-[#388bfd] disabled:opacity-50 transition-colors"
              >
                Send
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Approvals panel ──────────────────────────────────────────────────────────

function ApprovalsPanel({ boardId, tasks, onClose }: { boardId: string; tasks: Task[]; onClose: () => void }) {
  const { data: approvals = [], isLoading } = useApprovals(boardId)
  const updateApproval = useUpdateApproval(boardId)
  const [tab, setTab] = useState<'pending' | 'resolved'>('pending')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const pending = approvals.filter((a) => a.status === 'pending')
  const resolved = approvals.filter((a) => a.status !== 'pending')
  const shown = tab === 'pending' ? pending : resolved

  async function decide(id: string, status: 'approved' | 'rejected') {
    setUpdatingId(id)
    try {
      await updateApproval.mutateAsync({ id, status })
    } finally {
      setUpdatingId(null)
    }
  }

  const confidenceClass = (conf?: string | null) => {
    const n = parseFloat(conf ?? '0')
    if (n >= 0.8) return 'text-[#3fb950] border-[#3fb950]/30 bg-[#3fb950]/10'
    if (n >= 0.5) return 'text-[#d29922] border-[#d29922]/30 bg-[#d29922]/10'
    return 'text-[#f85149] border-[#f85149]/30 bg-[#f85149]/10'
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-[#161b22] border-l border-[#30363d] w-[420px] h-full flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363d]">
          <div>
            <h3 className="font-mono text-[12px] font-semibold text-[#e6edf3] uppercase tracking-wide flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-[#d29922]" />
              Approvals
            </h3>
            <p className="font-mono text-[10px] text-[#6e7681] mt-0.5">
              {pending.length} pending · {resolved.length} resolved
            </p>
          </div>
          <button onClick={onClose} className="text-[#6e7681] hover:text-[#e6edf3] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#30363d]">
          {(['pending', 'resolved'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 px-2 py-2.5 text-[10px] font-mono font-medium uppercase tracking-wider transition-colors',
                tab === t ? 'text-[#58a6ff] border-b-2 border-[#58a6ff]' : 'text-[#6e7681] hover:text-[#8b949e]',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="p-5 text-xs font-mono text-[#6e7681]">loading…</p>
          ) : shown.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-[#3fb950] opacity-60" />
              <p className="text-xs font-mono text-[#6e7681]">
                {tab === 'pending' ? 'No pending approvals' : 'No resolved approvals'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#21262d]">
              {shown.map((a: ApprovalFull) => (
                <div key={a.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#58a6ff] bg-[#58a6ff]/10 border border-[#58a6ff]/20 px-2 py-0.5">
                      {a.actionType}
                    </span>
                    <span className={cn('font-mono text-[10px] font-semibold border px-2 py-0.5', confidenceClass(a.confidence))}>
                      {a.confidence ? `${Math.round(parseFloat(a.confidence) * 100)}%` : '—'}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-mono text-[#6e7681]">agent · {a.agentId}</p>
                    {a.taskId && (
                      <p className="text-[11px] font-mono text-[#e6edf3] mt-1 flex items-center gap-1">
                        <ChevronRight className="h-3 w-3 text-[#6e7681]" />
                        {tasks.find((t) => t.id === a.taskId)?.title ?? (a.taskId.slice(0, 8) + '…')}
                      </p>
                    )}
                  </div>
                  {a.status === 'pending' ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => decide(a.id, 'approved')}
                        disabled={updatingId === a.id}
                        className="flex-1 py-1.5 text-xs font-mono font-semibold text-white bg-[#238636] border border-[#2ea043] hover:bg-[#2ea043] disabled:opacity-50 transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => decide(a.id, 'rejected')}
                        disabled={updatingId === a.id}
                        className="flex-1 py-1.5 text-xs font-mono font-semibold text-[#f85149] border border-[#f85149]/40 hover:bg-[#f85149]/10 disabled:opacity-50 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-[10px] font-mono text-[#6e7681]">
                      <Clock className="h-3 w-3" />
                      <span>{a.updatedAt ? relativeTime(a.updatedAt) : '—'}</span>
                      <span className={cn('ml-auto px-2 py-0.5 border font-semibold uppercase tracking-wider',
                        a.status === 'approved'
                          ? 'text-[#3fb950] border-[#3fb950]/30 bg-[#3fb950]/10'
                          : 'text-[#f85149] border-[#f85149]/30 bg-[#f85149]/10',
                      )}>
                        {a.status}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Board settings panel ─────────────────────────────────────────────────────

function BoardSettingsPanel({
  boardId,
  board,
  agents,
  onClose,
}: {
  boardId: string
  board: import('@/hooks/api/boards').Board
  agents: import('@/hooks/api/agents').Agent[] | undefined
  onClose: () => void
}) {
  const [name, setName] = useState(board.name)
  const [description, setDescription] = useState(board.description ?? '')
  const [objective, setObjective] = useState(board.objective ?? '')
  const [targetDate, setTargetDate] = useState(
    board.targetDate ? board.targetDate.slice(0, 10) : '',
  )
  const [gatewayAgentId, setGatewayAgentId] = useState(board.gatewayAgentId ?? '')
  const [requireApprovalForDone, setRequireApprovalForDone] = useState(board.requireApprovalForDone ?? false)
  const [requireReviewBeforeDone, setRequireReviewBeforeDone] = useState(board.requireReviewBeforeDone ?? false)
  const [blockStatusChangesWithPendingApproval, setBlockStatusChangesWithPendingApproval] = useState(board.blockStatusChangesWithPendingApproval ?? false)
  const [commentRequiredForReview, setCommentRequiredForReview] = useState(board.commentRequiredForReview ?? false)
  const [onlyLeadCanChangeStatus, setOnlyLeadCanChangeStatus] = useState(board.onlyLeadCanChangeStatus ?? false)
  const [maxAgents, setMaxAgents] = useState(board.maxAgents ?? 10)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggles: Array<{ label: string; value: boolean; set: (v: boolean) => void }> = [
    { label: 'Require approval before Done', value: requireApprovalForDone, set: setRequireApprovalForDone },
    { label: 'Require Review stage before Done', value: requireReviewBeforeDone, set: setRequireReviewBeforeDone },
    { label: 'Block status changes with pending approvals', value: blockStatusChangesWithPendingApproval, set: setBlockStatusChangesWithPendingApproval },
    { label: 'Comment required for Review', value: commentRequiredForReview, set: setCommentRequiredForReview },
    { label: 'Only lead can change status', value: onlyLeadCanChangeStatus, set: setOnlyLeadCanChangeStatus },
  ]

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await api.patch(`api/boards/${boardId}`, {
        json: {
          name: name.trim(),
          description: description.trim() || null,
          objective: objective.trim() || null,
          targetDate: targetDate ? new Date(targetDate).toISOString() : null,
          gatewayAgentId: gatewayAgentId || null,
          requireApprovalForDone,
          requireReviewBeforeDone,
          blockStatusChangesWithPendingApproval,
          commentRequiredForReview,
          onlyLeadCanChangeStatus,
          maxAgents,
        },
      }).json<unknown>()
      queryClient.invalidateQueries({ queryKey: ['board', boardId, 'snapshot'] })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-[#161b22] border-l border-[#30363d] w-[420px] h-full flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363d]">
          <div>
            <h3 className="font-mono text-[12px] font-semibold text-[#e6edf3] uppercase tracking-wide flex items-center gap-2">
              <Settings className="h-3.5 w-3.5 text-[#6e7681]" />
              Board settings
            </h3>
          </div>
          <button onClick={onClose} className="text-[#6e7681] hover:text-[#e6edf3] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Identity */}
          <section className="space-y-3">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#6e7681]">Identity</p>
            <div className="space-y-2">
              <label className="font-mono text-[11px] text-[#8b949e]">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#30363d] px-3 py-2 text-sm font-mono text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:border-[#58a6ff]"
              />
            </div>
            <div className="space-y-2">
              <label className="font-mono text-[11px] text-[#8b949e]">Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#30363d] px-3 py-2 text-sm font-mono text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:border-[#58a6ff]"
              />
            </div>
            <div className="space-y-2">
              <label className="font-mono text-[11px] text-[#8b949e]">Objective</label>
              <textarea
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                rows={3}
                className="w-full bg-[#0d1117] border border-[#30363d] px-3 py-2 text-sm font-mono text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:border-[#58a6ff] resize-none"
              />
            </div>
            <div className="space-y-2">
              <label className="font-mono text-[11px] text-[#8b949e]">Target date</label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#30363d] px-3 py-2 text-sm font-mono text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
              />
            </div>
            <div className="space-y-2">
              <label className="font-mono text-[11px] text-[#8b949e]">Gateway agent</label>
              <select
                value={gatewayAgentId}
                onChange={(e) => setGatewayAgentId(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#30363d] px-3 py-2 text-sm font-mono text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
              >
                <option value="">None</option>
                {(agents ?? []).map((a) => (
                  <option key={a.id} value={a.id}>{a.emoji ? `${a.emoji} ` : ''}{a.name}</option>
                ))}
              </select>
            </div>
          </section>

          {/* Governance */}
          <section className="space-y-3">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#6e7681]">Governance</p>
            {toggles.map(({ label, value, set }) => (
              <label key={label} className="flex items-center justify-between gap-3 cursor-pointer">
                <span className="font-mono text-[11px] text-[#8b949e]">{label}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={value}
                  onClick={() => set(!value)}
                  className={cn(
                    'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 transition-colors focus:outline-none',
                    value ? 'bg-[#1f6feb] border-[#388bfd]' : 'bg-[#21262d] border-[#30363d]',
                  )}
                >
                  <span className={cn(
                    'pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform my-auto',
                    value ? 'translate-x-4' : 'translate-x-0.5',
                  )} />
                </button>
              </label>
            ))}
          </section>

          {/* Capacity */}
          <section className="space-y-3">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#6e7681]">Capacity</p>
            <div className="space-y-2">
              <label className="font-mono text-[11px] text-[#8b949e]">Max agents (1–100)</label>
              <input
                type="number"
                min={1}
                max={100}
                value={maxAgents}
                onChange={(e) => setMaxAgents(Math.min(100, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                className="w-full bg-[#0d1117] border border-[#30363d] px-3 py-2 text-sm font-mono text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
              />
            </div>
          </section>

          {error && (
            <p className="font-mono text-xs text-[#f85149] border border-[#f85149]/30 bg-[#f85149]/10 px-3 py-2">{error}</p>
          )}
        </div>

        <div className="p-5 border-t border-[#30363d]">
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="w-full py-2 text-xs font-mono font-semibold text-white bg-[#1f6feb] border border-[#388bfd] hover:bg-[#388bfd] disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Board detail page ────────────────────────────────────────────────────────

function BoardDetailPage() {
  const { boardId } = Route.useParams()
  const { data: snapshot, isLoading, isError } = useBoard(boardId)
  const { data: agents } = useAgents()
  const updateTask = useUpdateTask()

  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [overColumn, setOverColumn] = useState<Status | null>(null)
  const [boardChatOpen, setBoardChatOpen] = useState(false)
  const [approvalsOpen, setApprovalsOpen] = useState(false)
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false)
  const [dragError, setDragError] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  function handleDragStart(event: DragStartEvent) {
    const task = snapshot?.tasks.find((t) => t.id === event.active.id)
    if (task) setActiveTask(task)
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null)
    setOverColumn(null)
    const { active, over } = event
    if (!over || !snapshot) return

    const taskId = active.id as string
    const task = snapshot.tasks.find((t) => t.id === taskId)
    if (!task) return

    // over could be a column id or another task id
    const targetColId = COLUMNS.find((c) => c.id === over.id)?.id
      ?? snapshot.tasks.find((t) => t.id === over.id)?.status

    if (!targetColId || targetColId === task.status) return

    // Optimistic update
    queryClient.setQueryData<BoardSnapshot>(['board', boardId, 'snapshot'], (old) => {
      if (!old) return old
      return {
        ...old,
        tasks: old.tasks.map((t) => (t.id === taskId ? { ...t, status: targetColId } : t)),
      }
    })

    try {
      await updateTask.mutateAsync({ id: taskId, status: targetColId })
    } catch (err: unknown) {
      queryClient.invalidateQueries({ queryKey: ['board', boardId, 'snapshot'] })
      let msg = 'Status change blocked by board governance.'
      try {
        const httpErr = err as { response?: { json?: () => Promise<{ error?: string }> } }
        if (httpErr.response?.json) {
          const body = await httpErr.response.json()
          if (body.error) msg = body.error
        }
      } catch {}
      setDragError(msg)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-[#8b949e]">Loading board…</div>
    )
  }

  if (isError || !snapshot) {
    return (
      <div className="flex items-center justify-center h-64 text-[#f85149]">Failed to load board.</div>
    )
  }

  const { board, tasks, approvals } = snapshot
  const pendingApprovals = approvals.filter((a) => a.status === 'pending')

  const tasksByStatus = (status: Status) => tasks.filter((t) => t.status === status)

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#21262d] pb-3 mb-2">
        <div>
          <h1 className="font-mono text-[13px] font-semibold text-[#e6edf3] tracking-wide uppercase">
            <span className="text-[#58a6ff]">~/boards/</span>{board.name}
          </h1>
          {board.description && <p className="font-mono text-[11px] text-[#6e7681] mt-0.5">{board.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBoardSettingsOpen(true)}
            className="px-3 py-1.5 font-mono text-[11px] text-[#6e7681] border border-[#30363d] hover:border-[#6e7681] transition-colors flex items-center gap-1.5"
          >
            <Settings className="h-3 w-3" />
          </button>
          <button
            onClick={() => setBoardChatOpen(true)}
            className="px-3 py-1.5 font-mono text-[11px] text-[#58a6ff] border border-[#30363d] hover:border-[#58a6ff] transition-colors flex items-center gap-1.5"
          >
            <MessageSquare className="h-3 w-3" />
            Chat
          </button>
        </div>
      </div>

      {/* Approval banner */}
      {pendingApprovals.length > 0 && (
        <div className="flex items-center gap-3 bg-[#271700] border border-[#9e6a03] px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-[#d29922] flex-shrink-0" />
          <span className="text-sm text-[#d29922] flex-1">
            {pendingApprovals.length} approval{pendingApprovals.length !== 1 ? 's' : ''} pending review
          </span>
          <button
            onClick={() => setApprovalsOpen(true)}
            className="text-xs font-medium text-[#d29922] hover:text-[#e3b341] border border-[#9e6a03] px-3 py-1 transition-colors"
          >
            Review
          </button>
        </div>
      )}

      {/* Drag error banner */}
      {dragError && (
        <div className="flex items-center gap-3 bg-[#1a0a0a] border border-[#f85149]/50 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-[#f85149] flex-shrink-0" />
          <span className="text-sm text-[#f85149] flex-1">{dragError}</span>
          <button
            onClick={() => setDragError(null)}
            className="text-[#f85149] hover:text-[#ff7b72] transition-colors flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Kanban board */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => {
          const overId = e.over?.id as string | undefined
          const col = COLUMNS.find((c) => c.id === overId)
          if (col) {
            setOverColumn(col.id)
          } else {
            const task = tasks.find((t) => t.id === overId)
            setOverColumn(task?.status ?? null)
          }
        }}
      >
        <div className="grid grid-cols-4 gap-3 flex-1 min-h-0">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              col={col}
              tasks={tasksByStatus(col.id)}
              boardId={boardId}
              agents={agents}
              isOver={overColumn === col.id && activeTask !== null}
              onOpenTask={setSelectedTask}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask && (
            <div className="shadow-xl rotate-1">
              <KanbanCard task={activeTask} agents={agents} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Task detail sheet */}
      {selectedTask && (
        <TaskDetailSheet
          task={selectedTask}
          agents={agents}
          snapshot={snapshot}
          onClose={() => setSelectedTask(null)}
        />
      )}

      {/* Board chat panel */}
      {boardChatOpen && (
        <BoardChatPanel
          boardId={boardId}
          boardName={board.name}
          gatewayAgentId={board.gatewayAgentId ?? null}
          onClose={() => setBoardChatOpen(false)}
        />
      )}

      {/* Approvals panel */}
      {approvalsOpen && (
        <ApprovalsPanel
          boardId={boardId}
          tasks={tasks}
          onClose={() => setApprovalsOpen(false)}
        />
      )}

      {/* Board settings panel */}
      {boardSettingsOpen && (
        <BoardSettingsPanel
          boardId={boardId}
          board={board}
          agents={agents}
          onClose={() => setBoardSettingsOpen(false)}
        />
      )}
    </div>
  )
}
