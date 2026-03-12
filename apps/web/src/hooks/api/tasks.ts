import { useMutation } from '@tanstack/react-query'
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
