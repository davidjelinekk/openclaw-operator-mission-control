import { useQuery, useMutation } from '@tanstack/react-query'
import { api, queryClient } from '@/lib/api'
import type { Task, BoardSnapshot } from './boards'

export interface TaskDep {
  id: string
  taskId: string
  dependsOnTaskId: string
  dependsOn?: Task
}

export interface TaskDeps {
  blockedBy: TaskDep[]
  blocking: TaskDep[]
}

export interface TaskNote {
  id: string
  taskId: string
  boardId: string
  agentId?: string | null
  eventType: string
  message: string
  metadata?: Record<string, unknown> | null
  createdAt: string
}

export function useTaskNotes(taskId: string) {
  return useQuery<TaskNote[]>({
    queryKey: ['task', taskId, 'notes'],
    queryFn: () => api.get(`api/tasks/${taskId}/notes`).json<TaskNote[]>(),
  })
}

export function useCreateTaskNote(taskId: string) {
  return useMutation({
    mutationFn: (data: { message: string; agentId?: string; metadata?: Record<string, unknown> }) =>
      api.post(`api/tasks/${taskId}/notes`, { json: data }).json<TaskNote>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId, 'notes'] })
    },
  })
}

export function useTasksInProgress(boardId?: string) {
  const searchParams: Record<string, string> = { status: 'in_progress' }
  if (boardId) searchParams.boardId = boardId
  return useQuery<Task[]>({
    queryKey: ['tasks', 'in_progress', boardId],
    queryFn: () => api.get('api/tasks', { searchParams }).json<Task[]>(),
    refetchInterval: 15_000,
  })
}

export function useInboxQueue(boardId?: string, limit?: number) {
  const searchParams: Record<string, string> = {}
  if (boardId) searchParams.boardId = boardId
  if (limit != null) searchParams.limit = String(limit)
  return useQuery<Task[]>({
    queryKey: ['tasks', 'queue', boardId, limit],
    queryFn: () => api.get('api/tasks/queue', { searchParams }).json<Task[]>(),
    refetchInterval: 15_000,
  })
}

export function useCreateTask(boardId: string) {
  return useMutation({
    mutationFn: (data: { title: string; status: Task['status']; priority?: Task['priority'] }) =>
      api.post('api/tasks', { json: { boardId, ...data } }).json<Task>(),
    onSuccess: (task) => {
      queryClient.setQueryData<BoardSnapshot>(['board', boardId, 'snapshot'], (old) => {
        if (!old) return old
        return { ...old, tasks: [...old.tasks, task] }
      })
    },
  })
}

export function useUpdateTask() {
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Task> & { id: string }) =>
      api.patch(`api/tasks/${id}`, { json: data }).json<Task>(),
    onSuccess: (task) => {
      queryClient.setQueryData<BoardSnapshot>(['board', task.boardId, 'snapshot'], (old) => {
        if (!old) return old
        return { ...old, tasks: old.tasks.map((t) => (t.id === task.id ? task : t)) }
      })
    },
  })
}

export function useDeleteTask() {
  return useMutation({
    mutationFn: ({ id }: { id: string; boardId: string }) =>
      api.delete(`api/tasks/${id}`).json<void>(),
    onSuccess: (_, { id, boardId }) => {
      queryClient.setQueryData<BoardSnapshot>(['board', boardId, 'snapshot'], (old) => {
        if (!old) return old
        return { ...old, tasks: old.tasks.filter((t) => t.id !== id) }
      })
    },
  })
}

export function useAddDep() {
  return useMutation({
    mutationFn: ({ taskId, dependsOnTaskId }: { taskId: string; dependsOnTaskId: string }) =>
      api.post(`api/tasks/${taskId}/deps`, { json: { dependsOnTaskId } }).json<TaskDep>(),
  })
}

export function useRemoveDep() {
  return useMutation({
    mutationFn: ({ taskId, depId }: { taskId: string; depId: string }) =>
      api.delete(`api/tasks/${taskId}/deps/${depId}`).json<void>(),
  })
}
