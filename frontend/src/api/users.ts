import { apiClient } from '@/lib/apiClient'
import type { User, PaginatedResult, Company } from '@/types'

export interface QueryUsersParams {
  page?: number
  limit?: number
  search?: string
  status?: string
  roleId?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export const usersApi = {
  getProfile: () => apiClient.get<User>('/profile'),

  updateProfile: (data: { fullName?: string; avatar?: string }) =>
    apiClient.patch<User>('/profile', data),

  changePassword: (data: {
    currentPassword: string
    newPassword: string
    confirmPassword: string
  }) => apiClient.patch<{ message: string }>('/profile/change-password', data),

  getAll: (params: QueryUsersParams) =>
    apiClient.get<PaginatedResult<User>>('/users', { params }),

  getOne: (id: string) => apiClient.get<User>(`/users/${id}`),

  create: (data: {
    fullName: string
    email: string
    password: string
    roleIds: string[]
  }) => apiClient.post<User>('/users', data),

  update: (
    id: string,
    data: { fullName?: string; email?: string; status?: string; roleIds?: string[] },
  ) => apiClient.patch<User>(`/users/${id}`, data),

  toggleStatus: (id: string) => apiClient.patch<User>(`/users/${id}/toggle-status`),

  delete: (id: string) => apiClient.delete<{ message: string }>(`/users/${id}`),

  assignRoles: (id: string, roleIds: string[]) =>
    apiClient.post<User>(`/users/${id}/roles`, { roleIds }),

  revokeRole: (id: string, roleId: string) =>
    apiClient.delete<User>(`/users/${id}/roles/${roleId}`),

  getUserCompanies: (id: string) =>
    apiClient.get<Company[]>(`/users/${id}/companies`),

  assignCompanies: (id: string, companyIds: string[]) =>
    apiClient.post<Company[]>(`/users/${id}/companies`, { companyIds }),
}
