import { useCallback, useEffect, useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  useNodesState,
  useEdgesState,
} from 'reactflow'
import type { Node, Edge } from 'reactflow'
import 'reactflow/dist/style.css'
import dagre from '@dagrejs/dagre'
import { ArrowLeft, Play, Loader2 } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { AgentChip } from '@/components/atoms/AgentChip'
import {
  useProject,
  useUpdateProject,
  useUpdateProjectTask,
  useKickoffProject,
  type Project,
  type ProjectTask,
  type Task,
} from '@/hooks/api/projects'
import { useAgents } from '@/hooks/api/agents'

export const Route = createFileRoute('/projects/$projectId')({
  component: ProjectDetailPage,
})

// --- helpers ---

const TASK_STATUS_COLORS: Record<Task['status'], string> = {
  inbox: '#21262d',
  in_progress: '#0d2341',
  review: '#1a1040',
  done: '#0d2818',
}

const TASK_STATUS_LABELS: Record<Task['status'], string> = {
  inbox: 'Inbox',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
}

const STATUS_BADGE: Record<Task['status'], string> = {
  inbox: 'text-[#8b949e] border-[#30363d]',
  in_progress: 'text-[#58a6ff] border-[#1f6feb]',
  review: 'text-[#a5a0ff] border-[#6e40c9]',
  done: 'text-[#3fb950] border-[#238636]',
}

const PROJECT_STATUS_STYLES: Record<Project['status'], string> = {
  planning: 'text-[#8b949e] border-[#30363d]',
  active: 'text-[#58a6ff] border-[#1f6feb]',
  paused: 'text-[#d29922] border-[#9e6a03]',
  complete: 'text-[#3fb950] border-[#238636]',
}

// --- dagre layout ---

function layoutNodes(
  rawNodes: Array<{ id: string; data: Record<string, unknown> }>,
  rawEdges: Array<{ id: string; source: string; target: string }>,
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', ranksep: 80, nodesep: 40 })

  rawNodes.forEach((n) => g.setNode(n.id, { width: 220, height: 80 }))
  rawEdges.forEach((e) => g.setEdge(e.source, e.target))
  dagre.layout(g)

  const nodes: Node[] = rawNodes.map((n) => {
    const pos = g.node(n.id)
    return {
      id: n.id,
      type: 'projectTask',
      position: { x: pos.x - 110, y: pos.y - 40 },
      data: n.data,
    }
  })

  const edges: Edge[] = rawEdges.map((e) => ({
    ...e,
    markerEnd: { type: MarkerType.ArrowClosed, color: '#58a6ff' },
  }))

  return { nodes, edges }
}

// --- custom node ---

interface TaskNodeData {
  task: Task | null
  agentName?: string
  agentEmoji?: string
}

function ProjectTaskNode({ data }: { data: TaskNodeData }) {
  const { task } = data
  if (!task) {
    return (
      <div
        style={{
          width: 220,
          height: 80,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#21262d',
          borderColor: '#30363d',
          borderWidth: 1,
          borderStyle: 'solid',
          borderRadius: 0,
        }}
        className="px-3 py-2 text-xs text-[#6e7681]"
      >
        Unknown task
      </div>
    )
  }

  return (
    <div
      style={{
        width: 220,
        height: 80,
        background: TASK_STATUS_COLORS[task.status],
        borderColor: '#30363d',
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: 0,
      }}
      className="px-3 py-2 flex flex-col justify-between"
    >
      <div className="flex items-center gap-1.5 overflow-hidden">
        <span
          className="inline-block h-2 w-2 rounded-full flex-shrink-0"
          style={{
            background:
              task.status === 'done'
                ? '#3fb950'
                : task.status === 'in_progress'
                  ? '#58a6ff'
                  : task.status === 'review'
                    ? '#a5a0ff'
                    : '#6e7681',
          }}
        />
        <span className="text-sm font-medium text-[#e6edf3] truncate">{task.title}</span>
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-[#8b949e]">{TASK_STATUS_LABELS[task.status]}</span>
        {data.agentName && (
          <AgentChip
            name={data.agentName}
            emoji={data.agentEmoji ?? '🤖'}
            className="text-xs py-0.5 px-2"
          />
        )}
      </div>
    </div>
  )
}

const nodeTypes = { projectTask: ProjectTaskNode }

// --- progress ring ---

function ProgressRing({ pct, size = 64 }: { pct: number; size?: number }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#30363d" strokeWidth={4} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#58a6ff"
        strokeWidth={4}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  )
}

// --- DAG panel ---

interface DagPanelProps {
  tasks: Array<{ pt: ProjectTask; task: Task | null }>
  agentMap: Map<string, { name: string; emoji?: string }>
}

function DagPanel({ tasks, agentMap }: DagPanelProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const buildGraph = useCallback(() => {
    if (tasks.length === 0) return

    const sorted = [...tasks].sort((a, b) => a.pt.position - b.pt.position)

    const rawNodes = sorted.map(({ pt, task }) => {
      const agent = task?.assignedAgentId ? agentMap.get(task.assignedAgentId) : undefined
      return {
        id: pt.taskId,
        data: {
          task,
          agentName: agent?.name,
          agentEmoji: agent?.emoji,
        } as Record<string, unknown>,
      }
    })

    // Build edges: sequential tasks chain; parallel tasks at same position share no edge between them
    const rawEdges: Array<{ id: string; source: string; target: string; animated: boolean }> = []

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]
      const curr = sorted[i]

      // Only draw edge when positions differ (sequential transition)
      if (prev.pt.position !== curr.pt.position) {
        const upstream = sorted.filter((t) => t.pt.position === prev.pt.position)
        const downstream = sorted.filter((t) => t.pt.position === curr.pt.position)

        for (const up of upstream) {
          for (const down of downstream) {
            const animated = up.task?.status !== 'done'
            rawEdges.push({
              id: `${up.pt.taskId}-${down.pt.taskId}`,
              source: up.pt.taskId,
              target: down.pt.taskId,
              animated,
            })
          }
        }
      }
    }

    // Deduplicate edges
    const seen = new Set<string>()
    const uniqueEdges = rawEdges.filter((e) => {
      if (seen.has(e.id)) return false
      seen.add(e.id)
      return true
    })

    const { nodes: layoutedNodes, edges: layoutedEdges } = layoutNodes(rawNodes, uniqueEdges)

    const styledEdges = layoutedEdges.map((e, idx) => ({
      ...e,
      animated: uniqueEdges[idx]?.animated ?? false,
      style: { stroke: '#58a6ff', strokeWidth: 1.5 },
    }))

    setNodes(layoutedNodes)
    setEdges(styledEdges)
  }, [tasks, agentMap, setNodes, setEdges])

  useEffect(() => {
    buildGraph()
  }, [buildGraph])

  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[#6e7681] text-sm">
        No tasks in this project yet.
      </div>
    )
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#21262d" gap={24} />
      <Controls style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 0 }} />
    </ReactFlow>
  )
}

// --- main page ---

function ProjectDetailPage() {
  const { projectId } = Route.useParams()
  const { data, isLoading, isError } = useProject(projectId)
  const { data: agents = [] } = useAgents()
  const updateProject = useUpdateProject(projectId)
  const updateTask = useUpdateProjectTask(projectId)
  const kickoff = useKickoffProject(projectId)

  const agentMap = useMemo(
    () => new Map(agents.map((a) => [a.id, { name: a.name, emoji: a.emoji ?? undefined }])),
    [agents],
  )

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#58a6ff]" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex h-64 items-center justify-center text-[#6e7681]">
        Failed to load project.
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center text-[#6e7681]">
        Project not found.
      </div>
    )
  }

  const { project, tasks } = data
  const orchestrator = project.orchestratorAgentId ? agentMap.get(project.orchestratorAgentId) : undefined

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* back link + title */}
      <div className="flex items-center gap-3">
        <Link to="/projects" className="text-[#8b949e] hover:text-[#e6edf3] transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-semibold text-[#e6edf3]">{project.name}</h1>
        <span className={`inline-flex items-center px-1.5 py-0.5 text-xs font-mono border capitalize ${PROJECT_STATUS_STYLES[project.status]}`}>
          {project.status}
        </span>
      </div>

      {/* two-column layout */}
      <div className="flex flex-row gap-4 flex-1 min-h-0">
        {/* DAG panel */}
        <div
          className="flex-1 border border-[#30363d] bg-[#161b22] overflow-hidden"
          style={{ minHeight: 600 }}
        >
          <DagPanel tasks={tasks} agentMap={agentMap} />
        </div>

        {/* Right sidebar */}
        <div className="w-72 flex flex-col gap-4 overflow-y-auto">
          {/* Progress + status card */}
          <div className="border border-[#30363d] bg-[#161b22] p-4 flex flex-col gap-4">
            {/* Progress ring */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <ProgressRing pct={project.progressPct} size={64} />
                <span className="absolute inset-0 flex items-center justify-center text-sm font-mono font-medium text-[#e6edf3]">
                  {project.progressPct}%
                </span>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-[#8b949e]">Progress</p>
                <p className="text-sm font-mono text-[#e6edf3]">{project.progressPct}% complete</p>
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-[#8b949e]">Status</label>
              <select
                value={project.status}
                onChange={(e) =>
                  updateProject.mutate({ status: e.target.value as Project['status'] })
                }
                className="w-full border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-[#e6edf3] outline-none focus:border-[#58a6ff]"
              >
                {(['planning', 'active', 'paused', 'complete'] as const).map((s) => (
                  <option key={s} value={s} className="capitalize">
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* Target date */}
            {project.targetDate && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-[#8b949e]">Target Date</p>
                <p className="text-sm font-mono text-[#e6edf3]">
                  {new Date(project.targetDate).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              </div>
            )}

            {/* Orchestrator */}
            {orchestrator && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[#8b949e]">Orchestrator</p>
                <AgentChip emoji={orchestrator.emoji ?? '🤖'} name={orchestrator.name} />
              </div>
            )}

            {/* Kickoff button */}
            <button
              onClick={() => kickoff.mutate()}
              disabled={kickoff.isPending || !project.orchestratorAgentId}
              className="mt-1 w-full inline-flex items-center justify-center gap-2 border border-[#238636] bg-[#238636] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2ea043] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {kickoff.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {kickoff.isPending ? 'Starting…' : 'Kickoff'}
            </button>
          </div>

          {/* Task list */}
          {tasks.length > 0 && (
            <div className="border border-[#30363d] bg-[#161b22] overflow-hidden">
              <div className="border-b border-[#30363d] px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wider text-[#8b949e]">Tasks ({tasks.length})</p>
              </div>
              <div className="flex flex-col divide-y divide-[#21262d]">
                {[...tasks]
                  .sort((a, b) => a.pt.position - b.pt.position)
                  .map(({ pt, task }) => (
                    <div key={pt.taskId} className="px-4 py-3 flex flex-col gap-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm text-[#e6edf3] leading-snug">{task?.title ?? pt.taskId}</span>
                        {task && (
                          <span
                            className={`inline-flex flex-shrink-0 items-center px-1.5 py-0.5 text-xs font-mono border ${STATUS_BADGE[task.status]}`}
                          >
                            {TASK_STATUS_LABELS[task.status]}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium uppercase tracking-wider text-[#6e7681]">Mode:</span>
                        <button
                          onClick={() =>
                            updateTask.mutate({
                              taskId: pt.taskId,
                              executionMode: pt.executionMode === 'sequential' ? 'parallel' : 'sequential',
                            })
                          }
                          className={`px-1.5 py-0.5 text-xs font-mono border transition-colors ${
                            pt.executionMode === 'sequential'
                              ? 'text-[#58a6ff] border-[#1f6feb] hover:bg-[#0d2341]'
                              : 'text-[#d29922] border-[#9e6a03] hover:bg-[#271700]'
                          }`}
                        >
                          {pt.executionMode}
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
