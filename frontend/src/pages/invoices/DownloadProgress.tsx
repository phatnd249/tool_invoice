import { useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
import type { LogEntry, DownloadResult, DownloadStatus } from '@/types'

interface DownloadProgressProps {
  status: DownloadStatus
  progress: number
  processed: number
  total: number
  currentInvoiceType: string
  logs: LogEntry[]
  result: DownloadResult | null
  errorMessage: string | null
}

const INVOICE_TYPE_LABELS: Record<string, string> = {
  BUY: 'Mua vào',
  SELL: 'Bán ra',
}

export function DownloadProgress({
  status,
  progress,
  processed,
  total,
  currentInvoiceType,
  logs,
  result,
  errorMessage,
}: DownloadProgressProps) {
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs])

  const statustext = (() => {
    switch (status) {
      case 'connecting':
        return 'Đang kết nối...'
      case 'running':
        return currentInvoiceType
          ? `Đang tải hoá đơn ${INVOICE_TYPE_LABELS[currentInvoiceType] || currentInvoiceType}...`
          : 'Đang tải...'
      case 'done':
        return 'Hoàn thành'
      case 'error':
        return 'Lỗi'
      default:
        return ''
    }
  })()

  return (
    <div className="space-y-3">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {status === 'running' || status === 'connecting' ? (
          <div className="size-2 rounded-full bg-blue-500 animate-pulse" />
        ) : status === 'done' ? (
          <div className="size-2 rounded-full bg-green-500" />
        ) : status === 'error' ? (
          <div className="size-2 rounded-full bg-destructive" />
        ) : null}
        <span className="text-sm font-medium">{statustext}</span>
        {status !== 'connecting' && (
          <span className="text-sm text-muted-foreground ml-auto tabular-nums">
            {progress}%
          </span>
        )}
      </div>

      {/* ── Progress bar ──────────────────────────────────────────────── */}
      <div className="space-y-1">
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full transition-all duration-300 rounded-full',
              status === 'error' ? 'bg-destructive' : 'bg-primary',
            )}
            style={{ width: `${Math.max(progress, 2)}%` }}
          />
        </div>
        {total > 0 && (
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {processed}/{total} hoá đơn
            </span>
            {currentInvoiceType && (
              <span>
                {INVOICE_TYPE_LABELS[currentInvoiceType] || currentInvoiceType}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Log stream ────────────────────────────────────────────────── */}
      <div className="h-48 overflow-y-auto bg-muted/30 rounded-lg border p-2 text-xs font-mono space-y-0.5">
        {logs.length === 0 && status === 'connecting' && (
          <div className="text-muted-foreground italic p-1">
            Đang kết nối đến server...
          </div>
        )}
        {logs.length === 0 && status === 'idle' && (
          <div className="text-muted-foreground italic p-1">
            Nhấn "Tải hoá đơn" để bắt đầu...
          </div>
        )}
        {logs.map((log, i) => (
          <div
            key={i}
            className={cn(
              'leading-relaxed',
              log.level === 'error' && 'text-destructive',
              log.level === 'warn' && 'text-yellow-600 dark:text-yellow-400',
            )}
          >
            <span className="opacity-50 select-none">
              {format(new Date(log.time), 'HH:mm:ss')}
            </span>{' '}
            {log.message}
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>

      {/* ── Error message ─────────────────────────────────────────────── */}
      {status === 'error' && errorMessage && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      {/* ── Result summary (when done) ────────────────────────────────── */}
      {status === 'done' && result && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
          {result.results.map((r) => (
            <div key={r.type} className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {r.type === 'BUY' ? 'Mua vào' : 'Bán ra'}
              </span>
              <span className="tabular-nums text-xs">
                {r.totalQueried} hoá đơn
                {r.created > 0 && (
                  <span className="text-green-600 dark:text-green-400">
                    {' '}
                    (+{r.created} mới)
                  </span>
                )}
                {r.updated > 0 && (
                  <span className="text-muted-foreground">
                    {' '}
                    ({r.updated} cập nhật)
                  </span>
                )}
              </span>
            </div>
          ))}
          <Separator />
          <div className="flex items-center justify-between font-semibold">
            <span>Tổng</span>
            <span className="tabular-nums">
              {result.totalSaved} hoá đơn đã lưu
            </span>
          </div>
          {/* Items download stats */}
          {result.results.some(
            (r) => r.itemsDownloaded > 0 || r.itemsFailed > 0,
          ) && (
            <>
              <Separator />
              <div className="text-xs text-muted-foreground space-y-0.5">
                {result.results.map((r) => (
                  <div key={r.type} className="flex justify-between">
                    <span>
                      {r.type === 'BUY' ? 'Mua vào' : 'Bán ra'}: ZIP/XML
                    </span>
                    <span>
                      <span className="text-green-600">
                        {r.itemsDownloaded} thành công
                      </span>
                      {r.itemsFailed > 0 && (
                        <span className="text-destructive">
                          , {r.itemsFailed} lỗi
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
