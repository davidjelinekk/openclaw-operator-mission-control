import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

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
