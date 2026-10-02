import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Cloud,
  CloudUpload,
  RefreshCw,
  HardDrive,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Download,
  Trash2,
  ExternalLink,
  Info,
  Clock,
  Database,
  FileArchive,
  ChevronDown,
  FolderSync,
  Copy,
  Check,
  Save,
  CheckCheck,
  Settings,
  Unlink,
  Folder,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import {
  backupApi,
  type BackupConfigStatus,
  type BackupLog,
  type DriveFileInfo,
} from '@/api/backup'
import { getErrorMessage } from '@/lib/apiClient'
import { Layout } from '@/components/layout/Layout'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// ─── Format Helpers ─────────────────────────────────────────────────────────

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return '0 B'
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function describeCron(cron: string | undefined): string {
  if (!cron) return '02:00 sáng mỗi ngày'
  const trimmed = cron.trim()
  if (trimmed === '0 2 * * *') return '02:00 sáng mỗi ngày'
  if (trimmed === '0 0 * * *') return '00:00 (Nửa đêm) mỗi ngày'
  if (trimmed === '0 */6 * * *') return 'Mỗi 6 tiếng một lần'
  if (trimmed === '0 */12 * * *') return 'Mỗi 12 tiếng một lần'
  if (trimmed === '0 0 * * 0') return 'Chủ nhật hàng tuần lúc 00:00'
  const matchDaily = trimmed.match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/)
  if (matchDaily) {
    const min = matchDaily[1].padStart(2, '0')
    const hr = matchDaily[2].padStart(2, '0')
    return `${hr}:${min} mỗi ngày`
  }
  return trimmed
}

function GoogleIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
      />
    </svg>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function BackupPage() {
  const [config, setConfig] = useState<BackupConfigStatus | null>(null)
  const [history, setHistory] = useState<BackupLog[]>([])
  const [driveFiles, setDriveFiles] = useState<DriveFileInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [triggering, setTriggering] = useState(false)
  const [connectingOAuth, setConnectingOAuth] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [activeTab, setActiveTab] = useState<'drive' | 'logs'>('drive')
  const [deletingFile, setDeletingFile] = useState<DriveFileInfo | null>(null)

  // Direct Inline Schedule Form State
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(true)
  const [cronSchedule, setCronSchedule] = useState('0 2 * * *')
  const [schedulePreset, setSchedulePreset] = useState<string>('daily_02')
  const [customTime, setCustomTime] = useState('02:00')
  const [retentionCount, setRetentionCount] = useState(7)
  const [backupMode, setBackupMode] = useState<'INCREMENTAL' | 'FULL'>('INCREMENTAL')
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [isScheduleDirty, setIsScheduleDirty] = useState(false)

  // Folder Dialog State
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false)
  const [folderInput, setFolderInput] = useState('')
  const [savingFolder, setSavingFolder] = useState(false)

  // OAuth Credentials Dialog State
  const [isOAuthCredentialsDialogOpen, setIsOAuthCredentialsDialogOpen] = useState(false)
  const [oauthClientIdInput, setOauthClientIdInput] = useState('')
  const [oauthClientSecretInput, setOauthClientSecretInput] = useState('')
  const [savingOAuthCredentials, setSavingOAuthCredentials] = useState(false)
  const [copiedRedirectUri, setCopiedRedirectUri] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [configRes, historyRes] = await Promise.all([
        backupApi.getConfig(),
        backupApi.getHistory(30),
      ])
      setConfig(configRes.data)
      setHistory(historyRes.data)

      if (configRes.data.isDriveConfigured) {
        try {
          const filesRes = await backupApi.getDriveFiles()
          setDriveFiles(filesRes.data)
        } catch {
          setDriveFiles([])
        }
      }
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Handle Google OAuth callback from URL params (?code=... or ?error=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const error = params.get('error')

    if (error) {
      toast.error(`Đăng nhập Google Drive thất bại: ${error}`)
      window.history.replaceState({}, document.title, window.location.pathname)
      return
    }

    if (code) {
      const processOAuthCallback = async () => {
        const toastId = toast.loading('Đang xác thực và kết nối tài khoản Google Drive...')
        try {
          const redirectUri = `${window.location.origin}/backup`
          const res = await backupApi.submitOAuthCallback(code, redirectUri)
          toast.success(res.data.message || 'Kết nối Google Drive thành công!', { id: toastId })
          await fetchData()
        } catch (err) {
          toast.error(getErrorMessage(err), { id: toastId })
        } finally {
          window.history.replaceState({}, document.title, window.location.pathname)
        }
      }

      processOAuthCallback()
    }
  }, [fetchData])

  // Sync loaded config into the editable Schedule Form
  useEffect(() => {
    if (config) {
      setAutoBackupEnabled(config.autoBackupEnabled)
      setRetentionCount(config.retentionCount ?? 7)
      setBackupMode(config.backupMode || 'INCREMENTAL')

      const currentCron = config.cronSchedule || '0 2 * * *'
      setCronSchedule(currentCron)

      if (currentCron === '0 2 * * *') {
        setSchedulePreset('daily_02')
      } else if (currentCron === '0 0 * * *') {
        setSchedulePreset('daily_00')
      } else if (currentCron === '0 */6 * * *') {
        setSchedulePreset('every_6h')
      } else if (currentCron === '0 */12 * * *') {
        setSchedulePreset('every_12h')
      } else if (currentCron === '0 0 * * 0') {
        setSchedulePreset('weekly_sun')
      } else {
        const matchDaily = currentCron.match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/)
        if (matchDaily) {
          setSchedulePreset('custom_daily_time')
          const min = matchDaily[1].padStart(2, '0')
          const hr = matchDaily[2].padStart(2, '0')
          setCustomTime(`${hr}:${min}`)
        } else {
          setSchedulePreset('custom_cron')
        }
      }
      setIsScheduleDirty(false)
    }
  }, [config])

  // Handle Preset Select
  const handlePresetSelect = (preset: string) => {
    setSchedulePreset(preset)
    setIsScheduleDirty(true)
    switch (preset) {
      case 'daily_02':
        setCronSchedule('0 2 * * *')
        break
      case 'daily_00':
        setCronSchedule('0 0 * * *')
        break
      case 'every_6h':
        setCronSchedule('0 */6 * * *')
        break
      case 'every_12h':
        setCronSchedule('0 */12 * * *')
        break
      case 'weekly_sun':
        setCronSchedule('0 0 * * 0')
        break
      case 'custom_daily_time': {
        const [hr, min] = customTime.split(':')
        setCronSchedule(`${parseInt(min, 10)} ${parseInt(hr, 10)} * * *`)
        break
      }
      default:
        break
    }
  }

  // Handle Custom Time change
  const handleCustomTimeChange = (timeStr: string) => {
    setCustomTime(timeStr)
    setIsScheduleDirty(true)
    const [hr, min] = timeStr.split(':')
    if (hr !== undefined && min !== undefined) {
      setCronSchedule(`${parseInt(min, 10)} ${parseInt(hr, 10)} * * *`)
    }
  }

  // Save Schedule settings to backend
  const handleSaveSchedule = async () => {
    try {
      setSavingSchedule(true)
      const res = await backupApi.updateSchedule({
        autoBackupEnabled,
        cronSchedule: cronSchedule.trim(),
        retentionCount: Number(retentionCount),
        backupMode,
      })

      toast.success(res.data.message || 'Đã cập nhật lịch sao lưu tự động thành công!')
      setIsScheduleDirty(false)
      fetchData()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSavingSchedule(false)
    }
  }

  // Connect Google Drive via OAuth 2.0 Web Flow
  const handleConnectOAuth = async () => {
    if (!config?.hasOAuthConfig) {
      // Prompt user to enter Client ID and Secret if not yet provided
      setIsOAuthCredentialsDialogOpen(true)
      return
    }

    try {
      setConnectingOAuth(true)
      const redirectUri = `${window.location.origin}/backup`
      const res = await backupApi.getOAuthUrl(redirectUri)
      if (res.data.url) {
        window.location.href = res.data.url
      } else {
        toast.error('Không tạo được đường dẫn đăng nhập Google OAuth')
      }
    } catch (err) {
      const msg = getErrorMessage(err)
      if (msg.includes('Chưa cấu hình') || !config?.hasOAuthConfig) {
        setIsOAuthCredentialsDialogOpen(true)
      } else {
        toast.error(msg)
      }
    } finally {
      setConnectingOAuth(false)
    }
  }

  // Disconnect Google Drive
  const handleDisconnectOAuth = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn ngắt kết nối tài khoản Google Drive hiện tại?')) {
      return
    }

    try {
      setDisconnecting(true)
      const res = await backupApi.disconnectOAuth()
      toast.success(res.data.message || 'Đã ngắt kết nối tài khoản Google Drive')
      fetchData()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setDisconnecting(false)
    }
  }

  // Save OAuth credentials & trigger OAuth flow immediately
  const handleSaveOAuthCredentials = async () => {
    if (!oauthClientIdInput.trim() || !oauthClientSecretInput.trim()) {
      toast.error('Vui lòng nhập đầy đủ Client ID và Client Secret')
      return
    }

    try {
      setSavingOAuthCredentials(true)
      const res = await backupApi.saveOAuthCredentials({
        clientId: oauthClientIdInput.trim(),
        clientSecret: oauthClientSecretInput.trim(),
      })
      toast.success(res.data.message || 'Đã lưu cấu hình Google OAuth thành công!')
      setIsOAuthCredentialsDialogOpen(false)
      await fetchData()

      // Automatically launch OAuth consent screen
      const redirectUri = `${window.location.origin}/backup`
      const urlRes = await backupApi.getOAuthUrl(redirectUri)
      if (urlRes.data.url) {
        window.location.href = urlRes.data.url
      }
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSavingOAuthCredentials(false)
    }
  }

  // Copy Redirect URI Helper
  const handleCopyRedirectUri = () => {
    const redirectUri = `${window.location.origin}/backup`
    navigator.clipboard.writeText(redirectUri)
    setCopiedRedirectUri(true)
    toast.success('Đã sao chép URI chuyển hướng (Redirect URI)')
    setTimeout(() => setCopiedRedirectUri(false), 2500)
  }

  // Open Folder Dialog
  const handleOpenFolderDialog = () => {
    setFolderInput(config?.folderId || '')
    setIsFolderDialogOpen(true)
  }

  // Update Folder
  const handleUpdateFolder = async () => {
    if (!folderInput.trim()) return
    try {
      setSavingFolder(true)
      const { data } = await backupApi.updateFolder(folderInput.trim())
      toast.success(`Đã cập nhật thư mục lưu trữ: ${data.folderName}`)
      setIsFolderDialogOpen(false)
      fetchData()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSavingFolder(false)
    }
  }

  // Test Connection
  const handleTestConnection = async () => {
    try {
      setTesting(true)
      const { data } = await backupApi.testConnection()
      if (data.success) {
        toast.success(data.message)
      } else {
        toast.error(data.message)
      }
      fetchData()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setTesting(false)
    }
  }

  // Trigger Backup
  const handleTriggerBackup = async (isFullBackup = false) => {
    try {
      setTriggering(true)
      toast.info(
        isFullBackup
          ? 'Đang chuẩn bị gói sao lưu toàn bộ (FULL)...'
          : 'Đang nén dữ liệu tối ưu băng thông (INCREMENTAL) và tải lên Google Drive...',
      )
      const { data } = await backupApi.triggerBackup({ isFullBackup })
      if (data.status === 'SUCCESS') {
        toast.success(
          `Sao lưu thành công! ${data.fileName} (${formatBytes(data.fileSize)})`,
        )
      } else {
        toast.error(`Sao lưu thất bại: ${data.errorMessage || 'Lỗi không xác định'}`)
      }
      fetchData()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setTriggering(false)
    }
  }

  // Delete Backup File
  const handleDeleteFile = async () => {
    if (!deletingFile) return
    try {
      await backupApi.deleteDriveFile(deletingFile.id)
      toast.success(`Đã xoá bản sao lưu "${deletingFile.name}" trên Drive`)
      setDeletingFile(null)
      fetchData()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  // Download Backup File
  const handleDownload = async (file: DriveFileInfo) => {
    try {
      toast.info(`Đang tải file "${file.name}" từ Google Drive...`)
      await backupApi.downloadDriveFile(file.id, file.name)
      toast.success('Tải file hoàn tất!')
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  return (
    <Layout title="Sao lưu Google Drive">
      <div className="space-y-6">
        {/* Header Action Bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Cloud className="size-6 text-primary" />
              Cấu hình Sao lưu Google Drive
            </h2>
            <p className="text-xs text-muted-foreground">
              Đăng nhập trực tiếp qua Google OAuth 2.0 và tự động đồng bộ hóa đơn lên Google Drive của bạn
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              disabled={loading}
              className="text-xs"
            >
              <RefreshCw className={`mr-1.5 size-3.5 ${loading ? 'animate-spin' : ''}`} />
              Làm mới
            </Button>

            {/* Trigger Backup Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    size="sm"
                    disabled={triggering || !config?.isDriveConfigured}
                    className="bg-primary text-primary-foreground font-medium text-xs shadow-2xs gap-1.5"
                  >
                    <CloudUpload className={`size-3.5 ${triggering ? 'animate-pulse' : ''}`} />
                    {triggering ? 'Đang sao lưu...' : 'Sao lưu ngay'}
                    <ChevronDown className="size-3 opacity-70" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem
                  onClick={() => handleTriggerBackup(false)}
                  className="cursor-pointer py-2"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-xs text-foreground flex items-center gap-1.5">
                      <FileArchive className="size-3.5 text-emerald-600" />
                      Sao lưu gia tăng (Incremental) — Khuyên dùng
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Chỉ gửi hóa đơn mới, tối ưu băng thông và tự động chia nhỏ file
                    </span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleTriggerBackup(true)}
                  className="cursor-pointer py-2"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-xs text-foreground flex items-center gap-1.5">
                      <Database className="size-3.5 text-sky-600" />
                      Sao lưu toàn bộ (Full Backup)
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Nén toàn bộ database và tất cả hóa đơn từ trước đến nay
                    </span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Top 2 Main Action Cards: Drive OAuth Connection + Schedule Form */}
        {loading && !config ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {/* ─── CARD 1: Google OAuth 2.0 Connection ─── */}
            <Card className="border-border/70 shadow-xs flex flex-col justify-between">
              <CardHeader className="pb-3 border-b border-border/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <GoogleIcon className="size-4.5" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold">
                        Google Drive OAuth 2.0
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Kết nối trực tiếp tài khoản Google, không cần quản lý file token JSON
                      </CardDescription>
                    </div>
                  </div>
                  {config?.isDriveConfigured ? (
                    <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">
                      <CheckCircle2 className="mr-1 size-3" /> Đã kết nối
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      <AlertTriangle className="mr-1 size-3" /> Chưa kết nối
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4 pt-4 text-xs">
                {config?.isDriveConfigured ? (
                  // Connected State
                  <div className="space-y-3.5">
                    {/* Account Email Display */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-foreground">
                        Tài khoản Google đang kết nối
                      </Label>
                      <div className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/60 border border-border/50">
                        <div className="flex items-center gap-2 truncate">
                          <GoogleIcon className="size-4 shrink-0" />
                          <span className="font-medium text-xs text-foreground truncate">
                            {config?.clientEmail || 'Tài khoản Google'}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30">
                          Sẵn sàng
                        </Badge>
                      </div>
                    </div>

                    {/* Target Google Drive Folder */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-foreground">
                        Thư mục lưu trữ trên Google Drive
                      </Label>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 px-3 py-2 rounded-md bg-muted/60 text-xs text-foreground truncate border border-border/50 flex items-center justify-between">
                          <div className="flex items-center gap-2 truncate">
                            <Folder className="size-3.5 text-amber-500 shrink-0" />
                            <span className="truncate font-medium">
                              {config?.folderName || config?.folderId || 'Invoice_Pro_Backups'}
                            </span>
                          </div>
                          {config?.folderUrl && (
                            <a
                              href={config.folderUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="ml-2 text-primary hover:text-primary/80 inline-flex items-center shrink-0"
                              title="Mở thư mục trên Google Drive"
                            >
                              <ExternalLink className="size-3.5" />
                            </a>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleOpenFolderDialog}
                          className="shrink-0 h-8 px-2.5 text-xs font-medium"
                        >
                          <FolderSync className="mr-1 size-3.5 text-primary" />
                          Đổi thư mục
                        </Button>
                      </div>
                    </div>

                    {/* Last Tested Status */}
                    {config?.lastTestedAt && (
                      <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-0.5">
                        <span>Lần kiểm tra gần nhất:</span>
                        <span>{formatDateTime(config.lastTestedAt)}</span>
                      </div>
                    )}

                    {config?.lastError && (
                      <div className="p-2.5 rounded-md bg-destructive/10 text-destructive text-[11px] flex items-start gap-1.5">
                        <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                        <span className="leading-tight">{config.lastError}</span>
                      </div>
                    )}

                    {/* Actions when Connected */}
                    <div className="pt-2 border-t border-border/50 flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleTestConnection}
                        disabled={testing}
                        className="flex-1 text-xs h-8.5"
                      >
                        <RefreshCw className={`mr-1.5 size-3.5 ${testing ? 'animate-spin' : ''}`} />
                        Kiểm tra kết nối
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsOAuthCredentialsDialogOpen(true)}
                        className="text-xs h-8.5 px-2.5 text-muted-foreground hover:text-foreground"
                        title="Cấu hình Client ID / Secret"
                      >
                        <Settings className="size-3.5" />
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDisconnectOAuth}
                        disabled={disconnecting}
                        className="text-xs h-8.5 px-3 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                      >
                        <Unlink className="mr-1.5 size-3.5" />
                        Ngắt kết nối
                      </Button>
                    </div>
                  </div>
                ) : (
                  // Not Connected State
                  <div className="space-y-4">
                    <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/15 space-y-2">
                      <div className="flex items-center gap-2 font-medium text-blue-700 dark:text-blue-300">
                        <GoogleIcon className="size-4 shrink-0" />
                        <span>Đăng nhập 1-click bằng tài khoản Google</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Chỉ cần đăng nhập và xác thực bằng tài khoản Google của bạn. Hệ thống sẽ tự động khởi tạo thư mục <strong>Invoice_Pro_Backups</strong> trên Google Drive và tự động gia hạn token chạy ngầm.
                      </p>
                    </div>

                    {config?.lastError && (
                      <div className="p-2.5 rounded-md bg-destructive/10 text-destructive text-[11px] flex items-start gap-1.5">
                        <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                        <span className="leading-tight">{config.lastError}</span>
                      </div>
                    )}

                    {/* Big Connect Button */}
                    <div className="pt-2 flex flex-col sm:flex-row gap-2">
                      <Button
                        onClick={handleConnectOAuth}
                        disabled={connectingOAuth}
                        size="sm"
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs h-9 shadow-sm"
                      >
                        <GoogleIcon className="mr-2 size-4" />
                        {connectingOAuth ? 'Đang chuyển hướng...' : 'Kết nối Google Drive'}
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsOAuthCredentialsDialogOpen(true)}
                        className="text-xs h-9 px-3"
                      >
                        <Settings className="mr-1.5 size-3.5 text-muted-foreground" />
                        Cài đặt OAuth
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ─── CARD 2: Direct Editable Schedule Form ─── */}
            <Card className="border-border/70 shadow-xs flex flex-col justify-between">
              <CardHeader className="pb-3 border-b border-border/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      <Calendar className="size-4" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold">
                        Cấu hình lịch chạy tự động &amp; Lưu trữ
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Tùy chỉnh giờ chạy, số bản lưu giữ và chế độ sao lưu trực tiếp tại đây
                      </CardDescription>
                    </div>
                  </div>
                  {autoBackupEnabled ? (
                    <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">
                      <Clock className="mr-1 size-3" /> Tự động bật
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Đang tắt
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4 pt-4 text-xs">
                {/* Switch Enable/Disable */}
                <div className="flex items-center justify-between p-2.5 rounded-lg border border-border/60 bg-muted/30">
                  <div className="space-y-0.5">
                    <Label htmlFor="inline-auto-backup" className="text-xs font-semibold cursor-pointer">
                      Bật tự động sao lưu theo lịch
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      {autoBackupEnabled
                        ? `Hệ thống sẽ tự động chạy: ${describeCron(cronSchedule)}`
                        : 'Tiến trình tự động đang tạm dừng.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    id="inline-auto-backup"
                    role="switch"
                    aria-checked={autoBackupEnabled}
                    onClick={() => {
                      setAutoBackupEnabled(!autoBackupEnabled)
                      setIsScheduleDirty(true)
                    }}
                    className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                      autoBackupEnabled ? 'bg-primary' : 'bg-muted-foreground/30'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        autoBackupEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Schedule Frequency Selector */}
                <div className="space-y-1.5">
                  <Label htmlFor="schedule-preset-select" className="text-xs font-semibold text-foreground">
                    Tần suất chạy sao lưu
                  </Label>
                  <select
                    id="schedule-preset-select"
                    value={schedulePreset}
                    onChange={(e) => handlePresetSelect(e.target.value)}
                    className="w-full h-8.5 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-2xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring font-medium"
                  >
                    <option value="daily_02">Hàng ngày lúc 02:00 sáng (0 2 * * *) — Khuyên dùng</option>
                    <option value="daily_00">Hàng ngày lúc 00:00 Nửa đêm (0 0 * * *)</option>
                    <option value="every_6h">Mỗi 6 tiếng một lần (0 */6 * * *)</option>
                    <option value="every_12h">Mỗi 12 tiếng một lần (0 */12 * * *)</option>
                    <option value="weekly_sun">Chủ nhật hàng tuần lúc 00:00 (0 0 * * 0)</option>
                    <option value="custom_daily_time">Chọn giờ cụ thể trong ngày (Giờ:Phút)...</option>
                    <option value="custom_cron">Tùy biến biểu thức Cron tự do...</option>
                  </select>
                </div>

                {/* If Custom Daily Time */}
                {schedulePreset === 'custom_daily_time' && (
                  <div className="flex items-center gap-3 p-2 rounded-md bg-muted/40 border border-border/50">
                    <Label htmlFor="custom-time-picker" className="text-xs font-medium shrink-0">
                      Chọn giờ chạy:
                    </Label>
                    <Input
                      id="custom-time-picker"
                      type="time"
                      value={customTime}
                      onChange={(e) => handleCustomTimeChange(e.target.value)}
                      className="w-36 h-7.5 font-mono text-xs"
                    />
                    <span className="text-[11px] text-muted-foreground font-mono">
                      Cron: {cronSchedule}
                    </span>
                  </div>
                )}

                {/* If Custom Cron */}
                {schedulePreset === 'custom_cron' && (
                  <div className="space-y-1 p-2 rounded-md bg-muted/40 border border-border/50">
                    <Label htmlFor="custom-cron-input" className="text-xs font-medium">
                      Nhập biểu thức Cron:
                    </Label>
                    <Input
                      id="custom-cron-input"
                      value={cronSchedule}
                      onChange={(e) => {
                        setCronSchedule(e.target.value)
                        setIsScheduleDirty(true)
                      }}
                      className="font-mono text-xs h-7.5"
                      placeholder="0 2 * * *"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Giải nghĩa: <strong>{describeCron(cronSchedule)}</strong> (phút giờ ngày tháng thứ)
                    </p>
                  </div>
                )}

                {/* Retention Count & Backup Mode in 2 columns */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <Label htmlFor="inline-retention-input" className="text-xs font-semibold">
                      Số bản lưu giữ (Retention)
                    </Label>
                    <Input
                      id="inline-retention-input"
                      type="number"
                      min={0}
                      max={100}
                      value={retentionCount}
                      onChange={(e) => {
                        setRetentionCount(Number(e.target.value))
                        setIsScheduleDirty(true)
                      }}
                      className="h-8 font-mono text-xs"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Tự xoá bản cũ khi vượt quá (0 = giữ hết)
                    </p>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="inline-backup-mode" className="text-xs font-semibold">
                      Chế độ sao lưu hóa đơn
                    </Label>
                    <select
                      id="inline-backup-mode"
                      value={backupMode}
                      onChange={(e) => {
                        setBackupMode(e.target.value as 'INCREMENTAL' | 'FULL')
                        setIsScheduleDirty(true)
                      }}
                      className="w-full h-8 rounded-md border border-input bg-background px-2.5 py-1 text-xs shadow-2xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="INCREMENTAL">Thông minh (Tiết kiệm băng thông)</option>
                      <option value="FULL">Toàn bộ (Full Backup)</option>
                    </select>
                    <p className="text-[10px] text-muted-foreground">
                      {backupMode === 'INCREMENTAL' ? 'Chỉ nén file mới/sửa đổi' : 'Nén tất cả từ trước đến nay'}
                    </p>
                  </div>
                </div>

                {/* Save Schedule Changes Button */}
                <div className="pt-2 border-t border-border/50">
                  <Button
                    onClick={handleSaveSchedule}
                    disabled={savingSchedule || !cronSchedule.trim()}
                    size="sm"
                    className={`w-full text-xs h-8.5 font-medium transition-all ${
                      isScheduleDirty
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm ring-2 ring-blue-500/30'
                        : 'bg-primary text-primary-foreground'
                    }`}
                  >
                    {savingSchedule ? (
                      <RefreshCw className="mr-1.5 size-3.5 animate-spin" />
                    ) : isScheduleDirty ? (
                      <Save className="mr-1.5 size-3.5" />
                    ) : (
                      <CheckCheck className="mr-1.5 size-3.5" />
                    )}
                    {savingSchedule
                      ? 'Đang lưu...'
                      : isScheduleDirty
                      ? 'Lưu thay đổi lịch chạy'
                      : 'Lịch chạy đã được lưu'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Storage Stats Banner */}
        <Card className="border-border/60 shadow-xs bg-muted/20">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-600 shrink-0">
                  <HardDrive className="size-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Tổng dung lượng cần sao lưu
                  </div>
                  <div className="text-xl font-bold text-foreground flex items-baseline gap-2">
                    {formatBytes(
                      (config?.database.sizeBytes || 0) +
                        (config?.invoices.sizeBytes || 0),
                    )}
                    <span className="text-xs font-normal text-muted-foreground">
                      (DB: {formatBytes(config?.database.sizeBytes)} • Hoá đơn: {config?.invoices.totalFiles || 0} tệp ~ {formatBytes(config?.invoices.sizeBytes)})
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground border-t sm:border-t-0 sm:border-l border-border/60 pt-2 sm:pt-0 sm:pl-4">
                <div>
                  <span className="font-semibold text-foreground">Lần sao lưu gần nhất:</span>{' '}
                  {formatDateTime(config?.lastBackup?.createdAt)}
                  {config?.lastBackup && (
                    <Badge
                      variant={config.lastBackup.status === 'SUCCESS' ? 'default' : 'destructive'}
                      className={`ml-1.5 text-[10px] py-0 px-1.5 ${
                        config.lastBackup.status === 'SUCCESS'
                          ? 'bg-emerald-600 hover:bg-emerald-700'
                          : ''
                      }`}
                    >
                      {config.lastBackup.status === 'SUCCESS' ? 'Thành công' : 'Thất bại'}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Setup Guide Collapsible Banner */}
        <Card className="border-sky-500/20 bg-sky-500/5 shadow-xs">
          <CardHeader
            className="cursor-pointer py-3"
            onClick={() => setShowGuide(!showGuide)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sky-700 dark:text-sky-400">
                <Info className="size-4" />
                <span className="text-sm font-semibold">
                  Hướng dẫn cấu hình Google Drive OAuth 2.0 (Nhanh chóng &amp; Tiện lợi)
                </span>
              </div>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <ChevronDown
                  className={`size-4 transition-transform ${
                    showGuide ? 'rotate-180' : ''
                  }`}
                />
              </Button>
            </div>
          </CardHeader>

          {showGuide && (
            <CardContent className="pt-0 text-xs text-muted-foreground space-y-3.5 border-t border-sky-500/10 mt-2">
              <p className="text-muted-foreground leading-relaxed pt-2">
                Hệ thống sử dụng phương thức <strong>Google OAuth 2.0</strong> — Cho phép đăng nhập 1-click bằng tài khoản Google của bạn trên trình duyệt mà không cần phải tải hay dán file token JSON nào.
              </p>

              <div className="space-y-2.5">
                <div className="font-semibold text-foreground">Quy trình 4 bước đơn giản trên Google Cloud Console:</div>
                <ol className="list-decimal pl-5 space-y-2 leading-relaxed">
                  <li>
                    <strong>Tạo Project &amp; Bật Google Drive API:</strong> Truy cập{' '}
                    <a
                      href="https://console.cloud.google.com/apis/credentials"
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline font-medium"
                    >
                      Google Cloud Console
                    </a>
                    , tạo Project mới &gt; vào <strong>APIs &amp; Services &gt; Library</strong> tìm <strong>Google Drive API</strong> và nhấn <strong>Enable</strong>.
                  </li>
                  <li>
                    <strong>Cấu hình OAuth Consent Screen:</strong> Vào <strong>OAuth consent screen</strong> &gt; chọn <strong>External</strong> &gt; điền Tên ứng dụng &amp; Email hỗ trợ &gt; tại mục <strong>Scopes</strong> thêm quyền <code>.../auth/drive.file</code> &gt; tại mục <strong>Test users</strong> thêm chính tài khoản Gmail bạn dùng sao lưu (không cần nộp đơn xin Google Verify).
                  </li>
                  <li>
                    <strong>Tạo OAuth Client ID:</strong> Vào <strong>Credentials &gt; Create Credentials &gt; OAuth client ID</strong> &gt; chọn loại <strong>Web application</strong> &gt; tại mục <strong>Authorized redirect URIs</strong> dán chính xác:
                    <div className="mt-1 flex items-center gap-2">
                      <code className="bg-muted px-2 py-1 rounded text-foreground font-mono text-[11px] select-all border border-border/60">
                        {window.location.origin}/backup
                      </code>
                    </div>
                  </li>
                  <li>
                    <strong>Kết nối &amp; Cấp quyền:</strong> Nhấn nút <strong>&quot;Cài đặt OAuth&quot;</strong> bên trên, dán <code>Client ID</code> &amp; <code>Client Secret</code> &gt; nhấn <strong>&quot;Lưu &amp; Kết nối Google&quot;</strong>. Khi Google hiện cảnh báo ứng dụng chưa xác minh, bấm <strong>Advanced (Nâng cao) &gt; Go to... (unsafe)</strong> và cấp quyền để hoàn tất!
                  </li>
                </ol>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-border">
          <button
            onClick={() => setActiveTab('drive')}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 px-1 ${
              activeTab === 'drive'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Cloud className="size-4" />
            File trên Google Drive ({driveFiles.length})
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 px-1 ${
              activeTab === 'logs'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Calendar className="size-4" />
            Nhật ký sao lưu ({history.length})
          </button>
        </div>

        {/* Tab 1: Google Drive Files List */}
        {activeTab === 'drive' && (
          <Card className="border-border/70 shadow-xs">
            <CardHeader className="py-3 px-4 border-b border-border/50">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold">
                    Danh sách các tệp sao lưu trên Google Drive
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Thư mục: <code className="font-mono text-foreground font-medium">{config?.folderName || 'Invoice_Pro_Backups'}</code>
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {driveFiles.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  {config?.isDriveConfigured
                    ? 'Chưa có tệp sao lưu nào trong thư mục này. Hãy nhấn "Sao lưu ngay" để tạo bản sao lưu đầu tiên.'
                    : 'Google Drive chưa được kết nối. Vui lòng kết nối để quản lý các tệp sao lưu.'}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[45%] text-xs">Tên file sao lưu (.zip)</TableHead>
                      <TableHead className="text-xs">Dung lượng</TableHead>
                      <TableHead className="text-xs">Thời gian tạo</TableHead>
                      <TableHead className="text-right text-xs">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {driveFiles.map((file) => (
                      <TableRow key={file.id}>
                        <TableCell className="font-mono text-xs font-medium flex items-center gap-2">
                          <FileArchive className="size-4 text-emerald-600 shrink-0" />
                          <span className="truncate">{file.name}</span>
                        </TableCell>
                        <TableCell className="text-xs">{formatBytes(file.size)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDateTime(file.createdTime)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {file.webViewLink && (
                              <a
                                href={file.webViewLink}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted text-foreground transition-colors"
                                title="Mở trên Google Drive"
                              >
                                <ExternalLink className="size-3.5" />
                              </a>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDownload(file)}
                              className="h-7 w-7 p-0 text-sky-600 hover:text-sky-700"
                              title="Tải về máy tính"
                            >
                              <Download className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeletingFile(file)}
                              className="h-7 w-7 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                              title="Xoá bản sao lưu này"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tab 2: Backup Logs */}
        {activeTab === 'logs' && (
          <Card className="border-border/70 shadow-xs">
            <CardHeader className="py-3 px-4 border-b border-border/50">
              <CardTitle className="text-sm font-semibold">
                Lịch sử các lần thực hiện sao lưu
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {history.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  Chưa có lịch sử sao lưu nào được ghi nhận.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs">Thời điểm</TableHead>
                      <TableHead className="text-xs">Tên file</TableHead>
                      <TableHead className="text-xs">Dung lượng</TableHead>
                      <TableHead className="text-xs">Loại</TableHead>
                      <TableHead className="text-xs">Thời gian chạy</TableHead>
                      <TableHead className="text-xs">Trạng thái</TableHead>
                      <TableHead className="text-xs">Chi tiết</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs font-mono">
                          {formatDateTime(log.createdAt)}
                        </TableCell>
                        <TableCell className="text-xs font-mono max-w-[200px] truncate">
                          {log.fileName}
                        </TableCell>
                        <TableCell className="text-xs">
                          {formatBytes(log.fileSize)}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {log.triggerType === 'AUTO' ? 'Tự động' : 'Thủ công'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDuration(log.durationMs)}
                        </TableCell>
                        <TableCell>
                          {log.status === 'SUCCESS' && (
                            <Badge variant="default" className="bg-emerald-600 text-[10px] py-0">
                              <CheckCircle2 className="mr-1 size-3" /> Thành công
                            </Badge>
                          )}
                          {log.status === 'FAILED' && (
                            <Badge variant="destructive" className="text-[10px] py-0">
                              <XCircle className="mr-1 size-3" /> Thất bại
                            </Badge>
                          )}
                          {log.status === 'IN_PROGRESS' && (
                            <Badge variant="secondary" className="text-[10px] py-0">
                              <RefreshCw className="mr-1 size-3 animate-spin" /> Đang chạy
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs max-w-[240px] truncate text-muted-foreground">
                          {log.status === 'FAILED' && (
                            <span className="text-rose-500 font-mono" title={log.errorMessage || ''}>
                              {log.errorMessage}
                            </span>
                          )}
                          {log.status === 'SUCCESS' && log.driveFileUrl && (
                            <a
                              href={log.driveFileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary underline flex items-center gap-1"
                            >
                              Drive <ExternalLink className="size-3" />
                            </a>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* ─── MODAL 1: Google OAuth Credentials Dialog ─── */}
        <Dialog open={isOAuthCredentialsDialogOpen} onOpenChange={setIsOAuthCredentialsDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <GoogleIcon className="size-5" />
                Cấu hình Google OAuth 2.0
              </DialogTitle>
              <DialogDescription>
                Nhập Client ID và Client Secret từ Google Cloud Console để kích hoạt tính năng đăng nhập Google Drive.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-xs">
              {/* Redirect URI with 1-click Copy */}
              <div className="space-y-1.5 p-3 rounded-lg bg-muted/50 border border-border/60">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-foreground">
                    Authorized redirect URI (URI chuyển hướng được phép)
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyRedirectUri}
                    className="h-6 px-2 text-[11px] text-primary"
                  >
                    {copiedRedirectUri ? (
                      <>
                        <Check className="mr-1 size-3 text-emerald-600" /> Đã chép
                      </>
                    ) : (
                      <>
                        <Copy className="mr-1 size-3" /> Sao chép
                      </>
                    )}
                  </Button>
                </div>
                <div className="font-mono text-xs text-foreground bg-background px-2.5 py-1.5 rounded border border-border/50 select-all">
                  {window.location.origin}/backup
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Hãy thêm URI này vào mục <strong>Authorized redirect URIs</strong> của OAuth Client trên Google Cloud Console.
                </p>
              </div>

              {/* Client ID Input */}
              <div className="space-y-1.5">
                <Label htmlFor="oauth-client-id" className="text-xs font-semibold">
                  Google Client ID
                </Label>
                <Input
                  id="oauth-client-id"
                  placeholder="Ví dụ: 123456789-abc.apps.googleusercontent.com"
                  value={oauthClientIdInput}
                  onChange={(e) => setOauthClientIdInput(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>

              {/* Client Secret Input */}
              <div className="space-y-1.5">
                <Label htmlFor="oauth-client-secret" className="text-xs font-semibold">
                  Google Client Secret
                </Label>
                <Input
                  id="oauth-client-secret"
                  type="password"
                  placeholder="Ví dụ: GOCSPX-..."
                  value={oauthClientSecretInput}
                  onChange={(e) => setOauthClientSecretInput(e.target.value)}
                  className="font-mono text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  Khóa bí mật sẽ được mã hóa chuẩn AES-256-GCM bảo mật an toàn trước khi lưu vào cơ sở dữ liệu.
                </p>
              </div>
            </div>

            <DialogFooter className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setIsOAuthCredentialsDialogOpen(false)}
                disabled={savingOAuthCredentials}
              >
                Huỷ bỏ
              </Button>
              <Button
                onClick={handleSaveOAuthCredentials}
                disabled={savingOAuthCredentials || !oauthClientIdInput.trim() || !oauthClientSecretInput.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium"
              >
                {savingOAuthCredentials ? (
                  <RefreshCw className="mr-2 size-4 animate-spin" />
                ) : (
                  <Check className="mr-2 size-4" />
                )}
                Lưu &amp; Kết nối Google
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── MODAL 2: Update Folder Dialog ─── */}
        <Dialog open={isFolderDialogOpen} onOpenChange={setIsFolderDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FolderSync className="size-5 text-primary" />
                Đổi thư mục lưu trữ trên Google Drive
              </DialogTitle>
              <DialogDescription>
                Dán liên kết (URL) hoặc mã ID của thư mục Google Drive bạn muốn lưu các bản sao lưu.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Label htmlFor="folder-input" className="text-sm font-medium">
                URL hoặc ID thư mục
              </Label>
              <Input
                id="folder-input"
                placeholder="https://drive.google.com/drive/folders/1abcXYZ... hoặc 1abcXYZ..."
                value={folderInput}
                onChange={(e) => setFolderInput(e.target.value)}
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Tài khoản Google đang kết nối phải có quyền truy cập vào thư mục này.
              </p>
            </div>
            <DialogFooter className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsFolderDialogOpen(false)}
                disabled={savingFolder}
              >
                Huỷ bỏ
              </Button>
              <Button
                onClick={handleUpdateFolder}
                disabled={savingFolder || !folderInput.trim()}
                className="bg-primary text-primary-foreground font-medium"
              >
                {savingFolder ? (
                  <RefreshCw className="mr-2 size-4 animate-spin" />
                ) : null}
                Lưu thư mục
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── MODAL 3: Delete Confirmation Dialog ─── */}
        <Dialog
          open={!!deletingFile}
          onOpenChange={(open) => !open && setDeletingFile(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Xác nhận xoá bản sao lưu?</DialogTitle>
              <DialogDescription>
                Hành động này sẽ xoá tệp <strong>{deletingFile?.name}</strong> khỏi thư mục Google Drive vĩnh viễn và không thể khôi phục.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeletingFile(null)}
              >
                Huỷ bỏ
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteFile}
              >
                Xác nhận xoá
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  )
}
