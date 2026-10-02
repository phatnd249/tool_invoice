import { apiClient } from '@/lib/apiClient'

export interface BackupConfigStatus {
  isDriveConfigured: boolean
  authMethod: 'OAUTH' | 'NOT_CONFIGURED'
  clientEmail: string | null
  folderId: string | null
  folderName?: string | null
  folderUrl?: string | null
  isConnected?: boolean
  hasOAuthConfig?: boolean
  oauthClientId?: string | null
  lastTestedAt?: string | null
  lastError?: string | null
  autoBackupEnabled: boolean
  cronSchedule: string
  retentionCount: number
  lastBackup: BackupLog | null
  backupMode?: 'INCREMENTAL' | 'FULL'
  maxChunkSizeMb?: number
  chunkDelayMs?: number
  database: {
    path: string
    exists: boolean
    sizeBytes: number
  }
  invoices: {
    path: string
    exists: boolean
    totalFiles: number
    sizeBytes: number
  }
}

export interface UpdateBackupSchedulePayload {
  autoBackupEnabled: boolean
  cronSchedule: string
  retentionCount?: number
  backupMode?: 'INCREMENTAL' | 'FULL'
  maxChunkSizeMb?: number
  chunkDelayMs?: number
}

export interface TestConnectionResult {
  success: boolean
  message: string
  folderName?: string
  folderId?: string
  clientEmail?: string
}

export interface BackupLog {
  id: string
  fileName: string
  fileSize: number | null
  driveFileId: string | null
  driveFileUrl: string | null
  status: 'SUCCESS' | 'FAILED' | 'IN_PROGRESS'
  triggerType: 'AUTO' | 'MANUAL'
  errorMessage: string | null
  durationMs: number | null
  createdAt: string
}

export interface DriveFileInfo {
  id: string
  name: string
  size: number
  createdTime: string
  webViewLink?: string
}

export const backupApi = {
  getConfig: () => apiClient.get<BackupConfigStatus>('/backup/config'),

  updateSchedule: (data: UpdateBackupSchedulePayload) =>
    apiClient.put<{
      success: boolean
      message: string
      data: UpdateBackupSchedulePayload
    }>('/backup/schedule', data),

  getOAuthUrl: (redirectUri?: string) =>
    apiClient.get<{ url: string }>(
      `/backup/oauth/url${redirectUri ? `?redirectUri=${encodeURIComponent(redirectUri)}` : ''}`,
    ),

  submitOAuthCallback: (code: string, redirectUri?: string) =>
    apiClient.post<{
      success: boolean
      message: string
      email: string
      folderId: string
      folderName: string
    }>('/backup/oauth/callback', { code, redirectUri }),

  saveOAuthCredentials: (data: { clientId: string; clientSecret: string }) =>
    apiClient.post<{ success: boolean; message: string }>(
      '/backup/oauth/credentials',
      data,
    ),

  disconnectOAuth: () =>
    apiClient.post<{ success: boolean; message: string }>('/backup/oauth/disconnect'),

  testConnection: () =>
    apiClient.post<TestConnectionResult>('/backup/test-connection'),

  triggerBackup: (options?: { isFullBackup?: boolean }) =>
    apiClient.post<BackupLog>('/backup/trigger', options),

  getHistory: (limit = 30) =>
    apiClient.get<BackupLog[]>(`/backup/history?limit=${limit}`),

  getDriveFiles: () => apiClient.get<DriveFileInfo[]>('/backup/drive-files'),

  deleteDriveFile: (fileId: string) =>
    apiClient.delete<{ success: boolean; message: string }>(
      `/backup/drive-files/${fileId}`,
    ),

  updateFolder: (folderId: string) =>
    apiClient.post<{
      success: boolean
      folderId: string
      folderName: string
      folderUrl?: string
    }>('/backup/folder', { folderId }),

  downloadDriveFile: async (fileId: string, fileName: string) => {
    const res = await apiClient.get(`/backup/drive-files/${fileId}/download`, {
      responseType: 'blob',
    })
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', fileName)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  },
}
