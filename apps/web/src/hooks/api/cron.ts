import { useQuery, useMutation } from '@tanstack/react-query'
import { api, queryClient } from '@/lib/api'

export interface CronRun {
  runAt: string
  durationMs?: number
  status: 'ok' | 'error' | 'timeout'
  errorMessage?: string
}

export interface CronJob {
  id: string
  name: string
  schedule: string
  agentId?: string
  status: 'ok' | 'error' | 'timeout' | 'running' | 'disabled'
  lastRunAt?: string
  lastDurationMs?: number
  consecutiveErrors: number
  nextRunAt?: string
  recentRuns?: CronRun[]
}

export function useCronJobs() {
  return useQuery<CronJob[]>({
    queryKey: ['cron'],
    queryFn: () => api.get('api/cron').json<CronJob[]>(),
    refetchInterval: 30_000,
  })
}

export function useTriggerCron() {
  return useMutation({
    mutationFn: (jobId: string) => api.post(`api/cron/${jobId}/run`).json<{ ok: true }>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cron'] })
    },
  })
}
