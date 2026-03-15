import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface GatewayStatus {
  ok: boolean
  connected: boolean
  gatewayUrl: string
  health?: unknown
}

export interface GatewaySession {
  key: string
  sessionId?: string
  kind?: string
  displayName?: string
  updatedAt?: number
  model?: string
  agentId?: string
}

export function useGatewayStatus() {
  return useQuery<GatewayStatus>({
    queryKey: ['gateway', 'status'],
    queryFn: () => api.get('api/gateway/status').json<GatewayStatus>(),
    refetchInterval: 10_000,
  })
}

export function useGatewaySessions() {
  return useQuery<GatewaySession[]>({
    queryKey: ['gateway', 'sessions'],
    queryFn: async () => {
      const result = await api.get('api/gateway/sessions').json<GatewaySession[] | { sessions: GatewaySession[] }>()
      if (Array.isArray(result)) return result
      if ('sessions' in result) return result.sessions
      return []
    },
    refetchInterval: 10_000,
  })
}
