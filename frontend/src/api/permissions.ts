import { apiClient } from '@/lib/apiClient'
import type { Permission } from '@/types'

export const permissionsApi = {
  getAll: () => apiClient.get<Permission[]>('/permissions'),

  getOne: (id: string) => apiClient.get<Permission>(`/permissions/${id}`),

  create: (data: { name: string; description?: string; group: string }) =>
    apiClient.post<Permission>('/permissions', data),

  update: (id: string, data: { description?: string; group?: string }) =>
    apiClient.patch<Permission>(`/permissions/${id}`, data),

  delete: (id: string) => apiClient.delete<{ message: string }>(`/permissions/${id}`),
}
