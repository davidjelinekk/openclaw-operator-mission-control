import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { api, queryClient } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { usePageActive } from '@/hooks/usePageActive'

export interface Approval {
  id: string
  boardId: string
  taskId?: string | null
  agentId: string
  actionType: string
  payload?: Record<string, unknown> | null
  confidence?: string | null
  rubricScores?: Record<string, unknown> | null
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  updatedAt: string
}

export function useApprovals(boardId: string) {
  const qc = useQueryClient()
  const token = useAuthStore((s) => s.token)
  const isActive = usePageActive()
  const esRef = useRef<EventSource | null>(null)

  const query = useQuery<Approval[]>({
    queryKey: ['approvals', boardId],
    queryFn: () => api.get(`api/approvals?boardId=${boardId}&limit=100`).json<Approval[]>(),
    enabled: Boolean(boardId),
  })

  useEffect(() => {
    if (!boardId || !token || !isActive) {
      esRef.current?.close()
      esRef.current = null
      return
    }

    const apiBase = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')
    const url = `${apiBase}/api/approvals/boards/${boardId}/stream?token=${encodeURIComponent(token)}`
    const es = new EventSource(url)
    esRef.current = es

    es.addEventListener('approval', (e) => {
      try {
        const incoming = JSON.parse(e.data) as Approval
        qc.setQueryData<Approval[]>(['approvals', boardId], (prev = []) => {
          const idx = prev.findIndex((a) => a.id === incoming.id)
          if (idx >= 0) {
            const next = [...prev]
            next[idx] = incoming
            return next
          }
          return [incoming, ...prev]
        })
      } catch {
        // ignore parse errors
      }
    })

    es.onerror = () => {
      es.close()
      esRef.current = null
    }

    return () => {
      es.close()
      esRef.current = null
    }
  }, [boardId, token, isActive, qc])

  return query
}

export function useUpdateApproval(boardId: string) {
  return useMutation({
    mutationFn: ({ id, status, rubricScores }: { id: string; status: 'approved' | 'rejected'; rubricScores?: Record<string, unknown> }) =>
      api.patch(`api/approvals/${id}`, { json: { status, ...(rubricScores && { rubricScores }) } }).json<Approval>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals', boardId] })
      queryClient.invalidateQueries({ queryKey: ['board', boardId, 'snapshot'] })
    },
  })
}
