import { apiClient } from '@/lib/apiClient'

// ─── Types (mirrors backend DTOs) ──────────────────────────────────────────

export interface ScheduleCompany {
  companyId: string
  company: {
    id: string
    taxCode: string
    name: string
  }
}

export interface Schedule {
  id: string
  name: string | null
  cronExpression: string
  repeatMode: 'once' | 'daily' | 'weekly' | 'monthly' | 'quarterly'
  scheduledAt: string | null
  dateRangeDays: number | null
  invoiceType: 'BUY' | 'SELL' | 'BOTH'
  overwriteMode: 'SKIP' | 'OVERWRITE' | 'NEW_VERSION'
  isActive: boolean
  lastRun: string | null
  createdAt: string
  updatedAt: string
  companies: ScheduleCompany[]
}

export interface CreateScheduleData {
  name?: string
  repeatMode: string
  cronExpression?: string
  scheduledAt?: string
  dateRangeDays?: number
  invoiceType: string
  overwriteMode?: string
}

export interface UpdateScheduleData {
  name?: string
  repeatMode?: string
  cronExpression?: string
  scheduledAt?: string
  dateRangeDays?: number
  invoiceType?: string
  overwriteMode?: string
}

export const schedulesApi = {
  getAll: () =>
    apiClient.get<Schedule[]>('/schedules'),

  getOne: (id: string) =>
    apiClient.get<Schedule>(`/schedules/${id}`),

  create: (data: CreateScheduleData) =>
    apiClient.post<Schedule>('/schedules', data),

  update: (id: string, data: UpdateScheduleData) =>
    apiClient.put<Schedule>(`/schedules/${id}`, data),

  toggle: (id: string) =>
    apiClient.patch<Schedule>(`/schedules/${id}/toggle`),

  updateCompanies: (id: string, companyIds: string[]) =>
    apiClient.put<Schedule>(`/schedules/${id}/companies`, { companyIds }),

  remove: (id: string) =>
    apiClient.delete(`/schedules/${id}`),
}
