import { apiClient } from '@/lib/apiClient'

export interface BackupConfigStatus {
  isDriveConfigured: boolean
  authMethod: 'KEY_PATH' | 'KEY_JSON' | 'ENV_CREDENTIALS' | 'JSON_CONTENT' | 'NOT_CONFIGURED'
  clientEmail: string | null
  folderId: string | null
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
