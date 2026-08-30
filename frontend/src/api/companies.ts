import { apiClient } from '@/lib/apiClient'
import type { Company, PaginatedResult } from '@/types'

export interface QueryCompaniesParams {
  page?: number
  limit?: number
  search?: string
  loginMode?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface CreateCompanyData {
  taxCode: string
  lookupPassword: string
  name?: string
  loginMode?: string
}

export interface UpdateCompanyData {
  name?: string
  lookupPassword?: string
  loginMode?: string
}

export const companiesApi = {
  getAll: (params: QueryCompaniesParams) =>
    apiClient.get<PaginatedResult<Company>>('/companies', { params }),

  getOne: (id: string) =>
    apiClient.get<Company>(`/companies/${id}`),

  create: (data: CreateCompanyData) =>
    apiClient.post<Company>('/companies', data),

  update: (id: string, data: UpdateCompanyData) =>
    apiClient.put<Company>(`/companies/${id}`, data),

  delete: (id: string) =>
    apiClient.delete<{ message: string }>(`/companies/${id}`),

  refreshToken: (id: string) =>
    apiClient.post<Company>(`/companies/${id}/refresh`),

  loginManual: (id: string, data: { ckey: string; cvalue: string }) =>
    apiClient.post<Company>(`/companies/${id}/login-manual`, data),

  getLoginManualCaptcha: (id: string) =>
    apiClient.get<{ ckey: string; captchaImage: string }>(
      `/companies/${id}/login-manual/captcha`,
    ),

  syncInfo: (id: string) =>
    apiClient.put<Company>(`/companies/${id}/sync-info`),
}
