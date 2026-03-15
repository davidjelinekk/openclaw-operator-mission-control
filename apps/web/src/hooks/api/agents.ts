import { useQuery, useMutation } from '@tanstack/react-query'
import { api, queryClient } from '@/lib/api'

export interface Agent {
  id: string
  name: string
  emoji?: string | null
  theme?: string | null
  primaryModel?: string | null
  fallbackModels?: string[]
  hasHeartbeat?: boolean
  status: 'online' | 'offline' | 'unknown'
  sessionCount?: number
}

export function useAgents() {
  return useQuery<Agent[]>({
    queryKey: ['agents'],
    queryFn: () => api.get('api/agents').json<Agent[]>(),
    refetchInterval: 15_000,
  })
}

export function useCreateAgent() {
  return useMutation({
    mutationFn: (data: { name: string; emoji?: string; primaryModel?: string; heartbeatInterval?: string }) =>
      api.post('api/agents', { json: data }).json<Agent>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  })
}

export function useDeleteAgent() {
  return useMutation({
    mutationFn: (agentId: string) => api.delete(`api/agents/${agentId}`).json<{ ok: boolean }>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  })
}
