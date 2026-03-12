import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface FlowNode {
  id: string
  agentId: string
  name: string
  emoji?: string
  isOnline: boolean
  hasActiveSession: boolean
  edgeCount: number
}

export interface FlowEdge {
  id: string
  fromAgentId: string
  toAgentId: string
  messageType: string
  tokenCost?: number
  occurredAt: string
  ageMs: number
}

export interface FlowGraph {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

export function useFlowGraph(window: string) {
  return useQuery<FlowGraph>({
    queryKey: ['flow', 'graph', window],
    queryFn: () => api.get(`api/flow/graph?window=${window}`).json<FlowGraph>(),
    refetchInterval: 30_000,
  })
}
