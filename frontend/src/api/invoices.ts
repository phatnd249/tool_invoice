import { apiClient } from '@/lib/apiClient'
import type { Invoice, PaginatedResult, DownloadResult, DownloadTask } from '@/types'

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

export interface QueryTasksParams {
  page?: number
  limit?: number
  status?: string
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
    apiClient.get<Invoice>(`/invoices/detail/${id}`),

  // ─── Task APIs ──────────────────────────────────────────

  /** Tạo task tải hoá đơn */
  createDownloadTask: (data: {
    companyId: string
    startDate: string
    endDate: string
    invoiceType?: string
  }) => apiClient.post<{ taskId: string }>('/invoices/tasks/download', data),

  /** Lấy task đang chạy của một company */
  getActiveTask: (companyId: string) =>
    apiClient.get<DownloadTask | null>(`/invoices/tasks/company/${companyId}`),

  /** Lấy danh sách task */
  getTasks: (params?: QueryTasksParams) =>
    apiClient.get<PaginatedResult<DownloadTask>>('/invoices/tasks', { params }),

  /** Lấy chi tiết một task */
  getTask: (taskId: string) =>
    apiClient.get<DownloadTask>(`/invoices/tasks/detail/${taskId}`),

  /** Lấy HTML preview của hoá đơn */
  preview: (id: string): Promise<string> =>
    apiClient.get(`/invoices/preview/${id}`, {
      responseType: 'text',
      params: { t: Date.now() },
    }).then(res => res.data),

  /** Xuất báo cáo Excel từ danh sách invoice đã chọn */
  exportExcel: (invoiceIds: string[]) =>
    apiClient.post('/invoices/export', { invoiceIds }, {
      responseType: 'blob',
    }).then(res => res.data),

  /** Xuất báo cáo Module 7 (Bảng kê 01/GTGT) */
  exportModule7: (invoiceIds: string[]) =>
    apiClient.post('/invoices/export-module7', { invoiceIds }, {
      responseType: 'blob',
    }).then(res => res.data),

  /** Tải lại các hoá đơn bị lỗi */
  retryFailed: (invoiceIds: string[]) =>
    apiClient.post<{
      successCount: number
      failedCount: number
      errors: Array<{ invoiceNumber: string; error: string }>
    }>('/invoices/retry-failed', { invoiceIds }),

  /** Tải PDF của hoá đơn */
  downloadPdf: (id: string) =>
    apiClient.get(`/invoices/pdf/${id}`, {
      responseType: 'blob',
    }).then(res => res.data),

  /** Tải ZIP của hoá đơn */
  downloadZip: (id: string) =>
    apiClient.get(`/invoices/zip/${id}`, {
      responseType: 'blob',
    }).then(res => res.data),
}
