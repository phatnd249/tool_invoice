import { apiClient } from '@/lib/apiClient'
import type { Role } from '@/types'

export const rolesApi = {
  getAll: () => apiClient.get<Role[]>('/roles'),

  getOne: (id: string) => apiClient.get<Role>(`/roles/${id}`),

  create: (data: { name: string; description?: string; permissionIds?: string[] }) =>
    apiClient.post<Role>('/roles', data),

  update: (
    id: string,
    data: { name?: string; description?: string; permissionIds?: string[] },
  ) => apiClient.patch<Role>(`/roles/${id}`, data),

  delete: (id: string) => apiClient.delete<{ message: string }>(`/roles/${id}`),
}
