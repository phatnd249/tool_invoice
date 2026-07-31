import { apiClient } from '@/lib/apiClient'
import type { Invoice, PaginatedResult, DownloadResult } from '@/types'

export interface QueryInvoicesParams {
  page?: number
  limit?: number
  search?: string
  type?: string
  startDate?: string
  endDate?: string
  companyId?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export const invoicesApi = {
  download: (data: {
    companyId: string
    startDate: string
    endDate: string
    invoiceType?: string
  }) => apiClient.post<DownloadResult>('/invoices/download', data),

  getAll: (params: QueryInvoicesParams) =>
    apiClient.get<PaginatedResult<Invoice>>('/invoices', { params }),

  getOne: (id: string) =>
    apiClient.get<Invoice>(`/invoices/${id}`),
}
