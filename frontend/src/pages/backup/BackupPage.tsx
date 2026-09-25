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
} from 'lucide-react'
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

// ─── Component ──────────────────────────────────────────────────────────────

export function BackupPage() {
  const [config, setConfig] = useState<BackupConfigStatus | null>(null)
  const [history, setHistory] = useState<BackupLog[]>([])
  const [driveFiles, setDriveFiles] = useState<DriveFileInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [triggering, setTriggering] = useState(false)
  const [deletingFile, setDeletingFile] = useState<DriveFileInfo | null>(null)
  const [showGuide, setShowGuide] = useState(false)
  const [activeTab, setActiveTab] = useState<'drive' | 'logs'>('drive')

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
          // Drive might be misconfigured
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

  const handleTriggerBackup = async () => {
    try {
      setTriggering(true)
      toast.info('Đang nén dữ liệu và tải lên Google Drive...')
      const { data } = await backupApi.triggerBackup()
      if (data.status === 'SUCCESS') {
        toast.success(
          `Sao lưu thành công! File: ${data.fileName} (${formatBytes(data.fileSize)})`,
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
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Sao lưu dữ liệu lên Google Drive
            </h2>
            <p className="text-sm text-muted-foreground">
              Tự động đóng gói cơ sở dữ liệu SQLite và toàn bộ hoá đơn (XML/PDF/ZIP) lưu trữ an toàn trên đám mây.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={testing || loading}
            >
              <RefreshCw
                className={`mr-2 size-4 ${testing ? 'animate-spin' : ''}`}
              />
              Kiểm tra kết nối
            </Button>

            <Button
              size="sm"
              onClick={handleTriggerBackup}
              disabled={triggering || loading || !config?.isDriveConfigured}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <CloudUpload
                className={`mr-2 size-4 ${triggering ? 'animate-spin' : ''}`}
              />
              {triggering ? 'Đang sao lưu...' : 'Sao lưu ngay'}
            </Button>
          </div>
        </div>

        {/* Overview Stats Cards */}
        {loading && !config ? (
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-36 rounded-xl" />
            <Skeleton className="h-36 rounded-xl" />
            <Skeleton className="h-36 rounded-xl" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {/* Card 1: Google Drive Status */}
            <Card className="border-border/60 shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Google Drive
                </CardTitle>
                <Cloud className="size-4 text-primary" />
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  {config?.isDriveConfigured ? (
                    <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">
                      <CheckCircle2 className="mr-1 size-3" /> Đã kết nối
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      <AlertTriangle className="mr-1 size-3" /> Chưa cấu hình
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {config?.authMethod !== 'NOT_CONFIGURED' ? config?.authMethod : 'Chưa có key'}
                  </span>
                </div>

                <div className="text-xs text-muted-foreground truncate">
                  <span className="font-semibold text-foreground">Email: </span>
                  {config?.clientEmail || 'Chưa thiết lập'}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  <span className="font-semibold text-foreground">Folder ID: </span>
                  {config?.folderId ? `${config.folderId.slice(0, 10)}...` : 'Chưa thiết lập'}
                </div>
              </CardContent>
            </Card>

            {/* Card 2: Auto Backup & Schedule */}
            <Card className="border-border/60 shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Lịch tự động & Lưu trữ
                </CardTitle>
                <Calendar className="size-4 text-primary" />
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  {config?.autoBackupEnabled && config.isDriveConfigured ? (
                    <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">
                      <Clock className="mr-1 size-3" /> Tự động bật
                    </Badge>
                  ) : (
                    <Badge variant="outline">Đang tắt</Badge>
                  )}
                  <span className="text-xs font-mono text-muted-foreground">
                    {config?.cronSchedule || '0 2 * * *'}
                  </span>
                </div>

                <div className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Lưu giữ: </span>
                  {config?.retentionCount
                    ? `Tối đa ${config.retentionCount} bản sao lưu gần nhất`
                    : 'Giữ lại tất cả (không tự xoá)'}
                </div>

                <div className="text-xs text-muted-foreground truncate">
                  <span className="font-semibold text-foreground">Lần gần nhất: </span>
                  {formatDateTime(config?.lastBackup?.createdAt)}
                  {config?.lastBackup && (
                    <span
                      className={`ml-1 font-medium ${
                        config.lastBackup.status === 'SUCCESS'
                          ? 'text-emerald-600'
                          : 'text-rose-500'
                      }`}
                    >
                      ({config.lastBackup.status === 'SUCCESS' ? 'Thành công' : 'Thất bại'})
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Card 3: Storage Overview */}
            <Card className="border-border/60 shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Dung lượng cần sao lưu
                </CardTitle>
                <HardDrive className="size-4 text-primary" />
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-xl font-bold text-foreground">
                  {formatBytes(
                    (config?.database.sizeBytes || 0) +
                      (config?.invoices.sizeBytes || 0),
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Database className="size-3 text-sky-500" /> DB:{' '}
                    {formatBytes(config?.database.sizeBytes)}
                  </span>
                  <span className="flex items-center gap-1">
                    <FileArchive className="size-3 text-amber-500" /> Hoá đơn:{' '}
                    {config?.invoices.totalFiles || 0} tệp (
                    {formatBytes(config?.invoices.sizeBytes)})
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

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
                  Hướng dẫn cấu hình kết nối Google Drive (Service Account)
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
            <CardContent className="pt-0 text-xs text-muted-foreground space-y-3 border-t border-sky-500/10 mt-2">
              <ol className="list-decimal pl-5 space-y-2 leading-relaxed pt-3">
                <li>
                  <strong className="text-foreground">Tạo Service Account trên Google Cloud:</strong> Vào{' '}
                  <a
                    href="https://console.cloud.google.com/apis/library/drive.googleapis.com"
                    target="_blank"
                    rel="noreferrer"
                    className="underline text-sky-600 hover:text-sky-500"
                  >
                    Google Cloud Console
                  </a>
                  , tạo hoặc chọn Project, bật <strong>Google Drive API</strong>. Sau đó vào mục <em>Credentials &gt; Create Credentials &gt; Service Account</em>.
                </li>
                <li>
                  <strong className="text-foreground">Tải Key JSON:</strong> Nhấp vào Service Account vừa tạo &gt; tab <em>Keys</em> &gt; <em>Add Key</em> &gt; <em>Create new key (JSON)</em>. Lưu file này vào thư mục <code>backend/credentials/google-service-account.json</code> (hoặc copy nội dung vào biến <code>GOOGLE_SERVICE_ACCOUNT_JSON</code> trong file <code>backend/.env</code>).
                </li>
                <li>
                  <strong className="text-foreground">Tạo thư mục trên Google Drive & Cấp quyền:</strong>
                  <ul className="list-disc pl-5 mt-1 space-y-1">
                    <li>Tạo một thư mục mới trên Google Drive (ví dụ: <em>Invoice_Pro_Backups</em>).</li>
                    <li>Mở thư mục, copy chuỗi <strong>ID thư mục</strong> từ thanh địa chỉ trình duyệt (dãy ký tự phía sau <code>folders/</code>) dán vào <code>GOOGLE_DRIVE_FOLDER_ID</code> trong <code>backend/.env</code>.</li>
                    <li>Bấm chuột phải vào thư mục trên Drive &gt; <strong>Chia sẻ (Share)</strong> &gt; Dán địa chỉ email của Service Account (dạng <code>xxx@xxx.iam.gserviceaccount.com</code>) và chọn quyền <strong>Người chỉnh sửa (Editor)</strong>.</li>
                  </ul>
                </li>
              </ol>
            </CardContent>
          )}
        </Card>

        {/* Tab Toggle Navigation */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('drive')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'drive'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Cloud className="size-4" />
            Bản sao lưu trên Google Drive ({driveFiles.length})
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'logs'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Clock className="size-4" />
            Nhật ký sao lưu hệ thống ({history.length})
          </button>
        </div>

        {/* Tab 1: Google Drive Files List */}
        {activeTab === 'drive' && (
          <Card className="border-border/60 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-medium text-foreground">
                  Danh sách tệp trên Google Drive
                </CardTitle>
                <CardDescription>
                  Các bản sao lưu ZIP hiện có trong thư mục Google Drive của hệ thống
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchData}
                disabled={loading}
              >
                <RefreshCw
                  className={`mr-2 size-4 ${loading ? 'animate-spin' : ''}`}
                />
                Làm mới
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2 py-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : driveFiles.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Cloud className="mx-auto size-10 opacity-30 mb-2" />
                  <p className="text-sm font-medium">Chưa có bản sao lưu nào trên Google Drive</p>
                  <p className="text-xs mt-1">
                    Nhấp vào nút &quot;Sao lưu ngay&quot; để tạo bản sao lưu đầu tiên của bạn.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tên tệp</TableHead>
                      <TableHead>Ngày tải lên</TableHead>
                      <TableHead>Dung lượng</TableHead>
                      <TableHead className="text-right">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {driveFiles.map((file) => (
                      <TableRow key={file.id}>
                        <TableCell className="font-mono text-xs font-semibold text-foreground">
                          <div className="flex items-center gap-2">
                            <FileArchive className="size-4 text-primary shrink-0" />
                            <span className="truncate max-w-[280px] sm:max-w-md">
                              {file.name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(file.createdTime)}
                        </TableCell>
                        <TableCell className="text-xs font-medium whitespace-nowrap">
                          {formatBytes(file.size)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {file.webViewLink && (
                              <a
                                href={file.webViewLink}
                                target="_blank"
                                rel="noreferrer"
                                title="Xem trên Drive"
                                className="inline-flex size-7 items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <ExternalLink className="size-4" />
                              </a>
                            )}


                            <Button
                              variant="ghost"
                              size="sm"
                              title="Tải về máy tính"
                              onClick={() => handleDownload(file)}
                            >
                              <Download className="size-4 text-sky-600 hover:text-sky-700" />
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              title="Xoá bản sao lưu này"
                              onClick={() => setDeletingFile(file)}
                            >
                              <Trash2 className="size-4 text-rose-500 hover:text-rose-600" />
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

        {/* Tab 2: Backup Execution Logs */}
        {activeTab === 'logs' && (
          <Card className="border-border/60 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-medium text-foreground">
                  Nhật ký thực thi sao lưu
                </CardTitle>
                <CardDescription>
                  Lịch sử các lần sao lưu tự động và thủ công cùng kết quả thực hiện
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchData}
                disabled={loading}
              >
                <RefreshCw
                  className={`mr-2 size-4 ${loading ? 'animate-spin' : ''}`}
                />
                Làm mới
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2 py-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : history.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Clock className="mx-auto size-10 opacity-30 mb-2" />
                  <p className="text-sm font-medium">Chưa có nhật ký sao lưu nào</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Thời gian</TableHead>
                      <TableHead>Phương thức</TableHead>
                      <TableHead>Tên tệp</TableHead>
                      <TableHead>Dung lượng</TableHead>
                      <TableHead>Thời lượng</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Chi tiết</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(log.createdAt)}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {log.triggerType === 'AUTO' ? (
                            <Badge variant="outline" className="text-blue-600 border-blue-300 dark:border-blue-800">
                              Tự động
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-amber-600 border-amber-300 dark:border-amber-800">
                              Thủ công
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs truncate max-w-[200px]">
                          {log.fileName}
                        </TableCell>
                        <TableCell className="text-xs font-medium whitespace-nowrap">
                          {formatBytes(log.fileSize)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDuration(log.durationMs)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {log.status === 'SUCCESS' && (
                            <Badge className="bg-emerald-600 hover:bg-emerald-700">
                              <CheckCircle2 className="mr-1 size-3" /> Thành công
                            </Badge>
                          )}
                          {log.status === 'FAILED' && (
                            <Badge variant="destructive">
                              <XCircle className="mr-1 size-3" /> Thất bại
                            </Badge>
                          )}
                          {log.status === 'IN_PROGRESS' && (
                            <Badge variant="secondary" className="animate-pulse">
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

        {/* Delete Confirmation Dialog */}
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
