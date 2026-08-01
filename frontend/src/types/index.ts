// ─── Enums ────────────────────────────────────────────────────────────────────

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'BANNED'

// ─── Entities ─────────────────────────────────────────────────────────────────

export interface Company {
  id: string
  taxCode: string
  name: string
  lookupPassword: string
  token: string | null
  tokenExpiredAt: string | null
  loginMode: 'AUTO' | 'MANUAL'
  downloadCount: number
  address: string | null
  taxAddress: string | null
  representative: string | null
  phone: string | null
  activeDate: string | null
  managedBy: string | null
  companyType: string | null
  status: string | null
  lastSyncedAt: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface Invoice {
  id: string
  invoiceNumber: string
  invoiceDate: string
  templateSymbol: string
  invoiceSymbol: string
  sellerTaxCode: string
  sellerName: string
  buyerTaxCode: string | null
  buyerName: string | null
  totalBeforeTax: number | null
  taxAmount: number | null
  totalAmount: number
  totalAmountInWords: string | null
  invoiceStatus: number | null
  processStatus: number | null
  type: 'BUY' | 'SELL'
  source: string | null
  zipPath: string | null
  xmlPath: string | null
  downloadStatus: string | null
  errorMessage: string | null
  companyId: string | null
  company?: Pick<Company, 'id' | 'name' | 'taxCode'>
  createdAt: string
  updatedAt: string
}

export interface DownloadResult {
  company: { id: string; name: string; taxCode: string }
  dateRange: { startDate: string; endDate: string }
  results: Array<{
    type: string
    totalQueried: number
    created: number
    updated: number
    itemsDownloaded: number
    itemsFailed: number
  }>
  totalSaved: number
}

export interface Permission {
  id: string
  name: string
  description: string | null
  group: string
  createdAt: string
  updatedAt: string
}

export interface Role {
  id: string
  name: string
  description: string | null
  isSystem: boolean
  permissions: Permission[]
  userCount: number
  createdAt: string
  updatedAt: string
}

export interface User {
  id: string
  fullName: string
  email: string
  avatar: string | null
  status: UserStatus
  emailVerified: boolean
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
  roles: (Pick<Role, 'id' | 'name' | 'description'> & { permissions: Pick<Permission, 'id' | 'name'>[] })[]
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface AuthUser {
  id: string
  email: string
}

// ─── API ─────────────────────────────────────────────────────────────────────

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface ApiError {
  message: string | string[]
  statusCode: number
  error?: string
}

// ─── Task Status ─────────────────────────────────────────────────────────────

export type TaskStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'ERROR'

export type DownloadStatus = 'idle' | 'connecting' | 'running' | 'done' | 'error'

export interface LogEntry {
  time: string
  message: string
  level: 'info' | 'warn' | 'error'
}

export interface DownloadTask {
  id: string
  companyId: string
  company?: Pick<Company, 'id' | 'name' | 'taxCode'>
  createdBy: string | null
  status: TaskStatus
  progress: number
  totalInvoices: number
  processedInvoices: number
  invoiceType: string
  dateStart: string
  dateEnd: string
  logs: LogEntry[]
  result: DownloadResult | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}
