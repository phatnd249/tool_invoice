import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { invoicesApi } from '@/api/invoices'
import { getErrorMessage, tokenStore } from '@/lib/apiClient'
import type { LogEntry, DownloadResult, DownloadStatus } from '@/types'

// ─── SSE Event Types ─────────────────────────────────────────────────────────

interface SseConnectedEvent {
  type: 'connected'
  taskId: string
  progress: number
  processed: number
  total: number
  invoiceType?: string
  status: string
  logs: LogEntry[]
}

interface SseStartEvent {
  type: 'start'
  invoiceType: string
  totalInvoices: number
  message: string
}

interface SseProgressEvent {
  type: 'progress'
  progress: number
  processed: number
  total: number
  invoiceType: string
  message: string
  currentDate?: string
  dayIndex?: number
  totalDays?: number
  dayInvoicesCount?: number
  dayProcessed?: number
}

interface SseDayStartEvent {
  type: 'day-start'
  currentDate: string
  dayIndex: number
  totalDays: number
  invoiceType?: string
  message: string
}

interface SseDayDoneEvent {
  type: 'day-done'
  currentDate: string
  dayIndex: number
  totalDays: number
  invoiceType?: string
  message: string
  dayStats: {
    totalQueried: number
    created: number
    updated: number
    itemsDownloaded: number
    itemsFailed: number
  }
}

interface SseLogEvent {
  type: 'log'
  level: 'info' | 'warn' | 'error'
  message: string
  time: string
}

interface SseDoneEvent {
  type: 'done'
  result: DownloadResult
}

interface SseErrorEvent {
  type: 'error'
  message: string
}

interface SseCancelledEvent {
  type: 'cancelled'
  message: string
}

type SseEvent =
  | SseConnectedEvent
  | SseStartEvent
  | SseProgressEvent
  | SseDayStartEvent
  | SseDayDoneEvent
  | SseLogEvent
  | SseDoneEvent
  | SseErrorEvent
  | SseCancelledEvent

// ─── Hook State ──────────────────────────────────────────────────────────────

export interface UseDownloadTaskReturn {
  /** Current task ID (null if no active task) */
  taskId: string | null
  /** Current download status */
  status: DownloadStatus
  /** Progress percentage (0-100) within current day */
  progress: number
  /** Overall progress across all days (0-100) */
  overallProgress: number
  /** Number of invoices processed in current day */
  processed: number
  /** Total number of invoices in current day */
  total: number
  /** Current invoice type being downloaded */
  currentInvoiceType: string
  /** Current date being processed (dd/mm/yyyy) */
  currentDate: string | null
  /** Current day index (1-based) */
  dayIndex: number
  /** Total number of days to process */
  totalDays: number
  /** Log entries from the task execution */
  logs: LogEntry[]
  /** Final result (only when status === 'done') */
  result: DownloadResult | null
  /** Error message (only when status === 'error') */
  errorMessage: string | null
  /** Start a new download task */
  startDownload: (params: {
    companyId: string
    startDate: string
    endDate: string
    invoiceType?: string
    overwriteMode?: string
  }) => Promise<void>
  /** Cancel the running download task */
  cancelDownload: () => Promise<void>
  /** Reset to idle state (for starting a new download) */
  reset: () => void
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SSE_BASE = '/api/invoices/tasks/stream'
const MAX_RECONNECT_ATTEMPTS = 10

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useDownloadTask(companyId: string): UseDownloadTaskReturn {
  const [taskId, setTaskId] = useState<string | null>(null)
  const [status, setStatus] = useState<DownloadStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [processed, setProcessed] = useState(0)
  const [total, setTotal] = useState(0)
  const [currentInvoiceType, setCurrentInvoiceType] = useState('')
  const [currentDate, setCurrentDate] = useState<string | null>(null)
  const [dayIndex, setDayIndex] = useState(0)
  const [totalDays, setTotalDays] = useState(0)
  const [dayInvoicesCount, setDayInvoicesCount] = useState(0)
  const [dayProcessed, setDayProcessed] = useState(0)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [result, setResult] = useState<DownloadResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Cleanup ──────────────────────────────────────────────────────────────

  const closeSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    reconnectAttemptsRef.current = 0
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => closeSSE()
  }, [closeSSE])

  // ── Handle SSE events ────────────────────────────────────────────────────

  const handleSseEvent = useCallback((event: SseEvent) => {
    switch (event.type) {
      case 'connected': {
        setTaskId(event.taskId)
        setProgress(event.progress)
        setProcessed(event.processed)
        setTotal(event.total)
        setLogs(event.logs || [])

        if (event.status === 'DONE') {
          // Task already done - will receive a 'done' event next
          setStatus('connecting')
        } else if (event.status === 'ERROR') {
          // Task already errored - will receive an 'error' event next
          setStatus('connecting')
        } else {
          setStatus('running')
        }
        break
      }

      case 'start': {
        setCurrentInvoiceType(event.invoiceType)
        break
      }

      case 'day-start': {
        setCurrentDate(event.currentDate)
        setDayIndex(event.dayIndex)
        setTotalDays(event.totalDays)
        if (event.invoiceType) {
          setCurrentInvoiceType(event.invoiceType)
        }
        // Reset per-day counters
        setDayProcessed(0)
        setDayInvoicesCount(0)
        setProgress(0)
        setProcessed(0)
        setTotal(0)
        break
      }

      case 'progress': {
        setProgress(event.progress)
        setProcessed(event.processed)
        setTotal(event.total)
        if (event.currentDate) setCurrentDate(event.currentDate)
        if (event.dayIndex != null) setDayIndex(event.dayIndex)
        if (event.totalDays != null) setTotalDays(event.totalDays)
        if (event.dayInvoicesCount != null) setDayInvoicesCount(event.dayInvoicesCount)
        if (event.dayProcessed != null) setDayProcessed(event.dayProcessed)
        break
      }

      case 'day-done': {
        // Mark day as fully processed
        setDayProcessed(event.dayStats.totalQueried)
        setDayInvoicesCount(event.dayStats.totalQueried)
        setProgress(100)
        break
      }

      case 'log': {
        setLogs((prev) => {
          // Avoid duplicates by checking last log
          if (
            prev.length > 0 &&
            prev[prev.length - 1].message === event.message &&
            prev[prev.length - 1].level === event.level
          ) {
            return prev
          }
          const newLogs = [...prev, { time: event.time, message: event.message, level: event.level }]
          // Limit to 1000 entries in memory
          if (newLogs.length > 1000) {
            return newLogs.slice(newLogs.length - 1000)
          }
          return newLogs
        })
        break
      }

      case 'done': {
        setStatus('done')
        setProgress(100)
        setResult(event.result)
        closeSSE()
        break
      }

      case 'error': {
        setStatus('error')
        setErrorMessage(event.message)
        closeSSE()
        break
      }

      case 'cancelled': {
        setStatus('cancelled')
        closeSSE()
        break
      }
    }
  }, [closeSSE])

  // ── Connect SSE ──────────────────────────────────────────────────────────

  const connectSSE = useCallback(
    (id: string) => {
      closeSSE()

      setTaskId(id)
      setStatus('connecting')

      // EventSource không gửi được Authorization header, nên truyền token qua query string
      const token = tokenStore.getAccess()
      const url = `${SSE_BASE}/${id}?token=${encodeURIComponent(token || '')}`
      const eventSource = new EventSource(url)
      eventSourceRef.current = eventSource

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as SseEvent
          handleSseEvent(data)
          // Reset reconnect attempts on successful message
          reconnectAttemptsRef.current = 0
        } catch {
          // Ignore parse errors
        }
      }

      eventSource.onerror = () => {
        reconnectAttemptsRef.current++

        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          closeSSE()
          // Fallback: fetch task status via API
          invoicesApi
            .getTask(id)
            .then(({ data }) => {
              if (data.status === 'DONE') {
                setStatus('done')
                setProgress(100)
                setResult(data.result)
                setLogs(data.logs)
              } else if (data.status === 'ERROR') {
                setStatus('error')
                setErrorMessage(data.errorMessage || 'Unknown error')
                setLogs(data.logs)
              }
            })
            .catch(() => {
              setStatus('error')
              setErrorMessage('Mất kết nối và không thể khôi phục trạng thái')
            })
        }
        // EventSource will auto-reconnect, we just track attempts
      }

      eventSource.onopen = () => {
        reconnectAttemptsRef.current = 0
      }
    },
    [closeSSE, handleSseEvent],
  )

  // ── Check active task on mount / companyId change ────────────────────────

  useEffect(() => {
    if (!companyId) return

    const checkActive = async () => {
      try {
        const { data } = await invoicesApi.getActiveTask(companyId)
        if (data && (data.status === 'PENDING' || data.status === 'RUNNING')) {
          // Restore state from DB response
          setTaskId(data.id)
          setProgress(data.progress)
          setProcessed(data.processedInvoices)
          setTotal(data.totalInvoices)
          setLogs(data.logs || [])
          setStatus('connecting')

          // Reconnect SSE
          connectSSE(data.id)
        }
      } catch {
        // No active task or error - stay idle
      }
    }

    checkActive()
  }, [companyId, connectSSE])

  // ── Start download ───────────────────────────────────────────────────────

  const startDownload = useCallback(
    async (params: {
      companyId: string
      startDate: string
      endDate: string
      invoiceType?: string
      overwriteMode?: string
    }) => {
      // Reset state
      setProgress(0)
      setProcessed(0)
      setTotal(0)
      setLogs([])
      setResult(null)
      setErrorMessage(null)
      setCurrentInvoiceType('')
      setCurrentDate(null)
      setDayIndex(0)
      setTotalDays(0)
      setDayInvoicesCount(0)
      setDayProcessed(0)

      try {
        const { data } = await invoicesApi.createDownloadTask(params)
        connectSSE(data.taskId)
      } catch (err) {
        toast.error(getErrorMessage(err))
        setStatus('idle')
      }
    },
    [connectSSE],
  )

  // ── Cancel download ────────────────────────────────────────────────────

  const cancelDownload = useCallback(async () => {
    if (!taskId) return

    try {
      await invoicesApi.cancelTask(taskId)
      toast.info('Đã yêu cầu huỷ task. Đang dừng...')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      // Luôn đóng SSE
      closeSSE()
      setStatus('cancelled')
    }
  }, [taskId, closeSSE])

  // ── Reset ────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    closeSSE()
    setTaskId(null)
    setStatus('idle')
    setProgress(0)
    setProcessed(0)
    setTotal(0)
    setLogs([])
    setResult(null)
    setErrorMessage(null)
    setCurrentInvoiceType('')
    setCurrentDate(null)
    setDayIndex(0)
    setTotalDays(0)
    setDayInvoicesCount(0)
    setDayProcessed(0)
  }, [closeSSE])

  // ── Computed: overall progress across all days ──────────────────────
  const overallProgress = (() => {
    if (totalDays === 0) return progress
    // Fraction completed so far: (completed days + progress within current day)
    const completedDays = dayIndex - 1
    const currentDayFraction =
      dayInvoicesCount > 0 ? dayProcessed / dayInvoicesCount : 0
    return Math.round(
      ((completedDays + currentDayFraction) / totalDays) * 100,
    )
  })()

  return {
    taskId,
    status,
    progress,
    overallProgress,
    processed,
    total,
    currentInvoiceType,
    currentDate,
    dayIndex,
    totalDays,
    logs,
    result,
    errorMessage,
    startDownload,
    cancelDownload,
    reset,
  }
}
