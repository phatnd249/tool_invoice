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

type SseEvent =
  | SseConnectedEvent
  | SseStartEvent
  | SseProgressEvent
  | SseLogEvent
  | SseDoneEvent
  | SseErrorEvent

// ─── Hook State ──────────────────────────────────────────────────────────────

export interface UseDownloadTaskReturn {
  /** Current task ID (null if no active task) */
  taskId: string | null
  /** Current download status */
  status: DownloadStatus
  /** Progress percentage (0-100) */
  progress: number
  /** Number of invoices processed */
  processed: number
  /** Total number of invoices to download */
  total: number
  /** Current invoice type being downloaded */
  currentInvoiceType: string
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
  }) => Promise<void>
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

      case 'progress': {
        setProgress(event.progress)
        setProcessed(event.processed)
        setTotal(event.total)
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
    }) => {
      // Reset state
      setProgress(0)
      setProcessed(0)
      setTotal(0)
      setLogs([])
      setResult(null)
      setErrorMessage(null)
      setCurrentInvoiceType('')

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
  }, [closeSSE])

  return {
    taskId,
    status,
    progress,
    processed,
    total,
    currentInvoiceType,
    logs,
    result,
    errorMessage,
    startDownload,
    reset,
  }
}
