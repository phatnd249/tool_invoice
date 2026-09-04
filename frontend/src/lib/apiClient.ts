import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { toast } from 'sonner'

// ─── Axios Instance ───────────────────────────────────────────────────────────

export const apiClient = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// ─── Token Helpers ────────────────────────────────────────────────────────────

const ACCESS_TOKEN_KEY = 'access_token'
const REFRESH_TOKEN_KEY = 'refresh_token'

export const tokenStore = {
  getAccess: () => localStorage.getItem(ACCESS_TOKEN_KEY),
  setAccess: (token: string | null) => {
    if (token) localStorage.setItem(ACCESS_TOKEN_KEY, token)
    else localStorage.removeItem(ACCESS_TOKEN_KEY)
  },
  getRefresh: () => localStorage.getItem(REFRESH_TOKEN_KEY),
  setRefresh: (token: string | null) => {
    if (token) localStorage.setItem(REFRESH_TOKEN_KEY, token)
    else localStorage.removeItem(REFRESH_TOKEN_KEY)
  },
  clear: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  },
}

// ─── Refresh Token Queue ──────────────────────────────────────────────────────

type QueueItem = {
  resolve: (token: string) => void
  reject: (err: unknown) => void
}

let isRefreshing = false
let refreshQueue: QueueItem[] = []

function processQueue(error: unknown, token: string | null) {
  refreshQueue.forEach((item) => {
    if (error) item.reject(error)
    else item.resolve(token as string)
  })
  refreshQueue = []
}

// ─── Request Interceptor ──────────────────────────────────────────────────────

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.getAccess()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ─── Response Interceptor ─────────────────────────────────────────────────────

// ── Error Body Normalizer ───────────────────────────────────────────────────
// Khi responseType là 'blob' hoặc 'text' (download/export/preview), Axios trả
// error response data dưới dạng Blob hoặc chuỗi text chứa JSON error của
// backend. Cần parse về object để các hàm xử lý lỗi (getErrorMessage) đọc
// được `message` và hiển thị đúng thông báo.
async function normalizeErrorData(error: AxiosError): Promise<void> {
  const data = error.response?.data as unknown
  if (!data) return

  // Blob → đọc text rồi parse
  if (data instanceof Blob) {
    try {
      const text = await data.text()
      const json = JSON.parse(text)
      error.response!.data = json
    } catch {
      // Không phải JSON hợp lệ → giữ nguyên
    }
    return
  }

  // Chuỗi text → parse nếu là JSON error object
  if (typeof data === 'string' && data.trim().startsWith('{')) {
    try {
      error.response!.data = JSON.parse(data)
    } catch {
      // Không phải JSON hợp lệ → giữ nguyên
    }
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // ── Parse error body nếu là Blob/chuỗi JSON ──────────────────────────
    await normalizeErrorData(error)

    // ── 403 Forbidden ──────────────────────────────────────────────────────
    if (error.response?.status === 403) {
      toast.error('Bạn không có quyền thực hiện thao tác này.')
      return Promise.reject(error)
    }

    // ── 401 Unauthorized → try refresh ───────────────────────────────────
    // Skip refresh for login and refresh-token requests themselves
    const isAuthRequest =
      originalRequest.url?.includes('/auth/login') ||
      originalRequest.url?.includes('/auth/refresh')

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthRequest) {
      const refreshToken = tokenStore.getRefresh()

      if (!refreshToken) {
        tokenStore.clear()
        window.location.href = '/login'
        return Promise.reject(error)
      }

      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          refreshQueue.push({ resolve, reject })
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`
          return apiClient(originalRequest)
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const { data } = await axios.post('/api/auth/refresh', { refreshToken })
        tokenStore.setAccess(data.accessToken)
        tokenStore.setRefresh(data.refreshToken)
        processQueue(null, data.accessToken)
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`
        return apiClient(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        tokenStore.clear()
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  },
)

// ─── Error Message Helper ─────────────────────────────────────────────────────

// Dự phòng: dịch các chuỗi lỗi tiếng Anh phổ biến phát sinh từ thư viện /
// dịch vụ bên thứ ba (Prisma, GDT, trình duyệt...) mà backend không kiểm soát.
const FALLBACK_MESSAGE_MAP: [RegExp, string][] = [
  [/request failed with status code 401/i, 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'],
  [/request failed with status code 403/i, 'Bạn không có quyền thực hiện thao tác này.'],
  [/request failed with status code 404/i, 'Không tìm thấy tài nguyên yêu cầu.'],
  [/request failed with status code 429/i, 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.'],
  [/request failed with status code 5\d\d/i, 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.'],
  [/timeout/i, 'Yêu cầu đã hết thời gian chờ. Vui lòng thử lại.'],
  [/network error/i, 'Lỗi kết nối mạng. Vui lòng thử lại.'],
  [/invalid captcha/i, 'Mã captcha không hợp lệ.'],
  [/login failed/i, 'Đăng nhập thất bại.'],
  [/not found/i, 'Không tìm thấy dữ liệu yêu cầu.'],
  [/unknown error/i, 'Lỗi không xác định.'],
]

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const rawData = error.response?.data as unknown
    if (rawData == null) return 'Lỗi kết nối mạng. Vui lòng thử lại.'
    // Trường hợp data vẫn là chuỗi text plain (không phải JSON)
    if (typeof rawData === 'string') {
      const trimmed = rawData.trim()
      if (trimmed) return applyFallbackMap(trimmed)
      return 'Đã có lỗi xảy ra.'
    }
    const data = rawData as { message?: string | string[]; error?: string }
    if (Array.isArray(data.message)) return data.message.join(', ')
    if (typeof data.message === 'string' && data.message) return applyFallbackMap(data.message)
    // Dự phòng: nếu backend trả lỗi ở field `error`
    if (typeof data.error === 'string' && data.error) return applyFallbackMap(data.error)
    return 'Đã có lỗi xảy ra.'
  }
  return 'Đã có lỗi xảy ra.'
}

function applyFallbackMap(message: string): string {
  const lower = message.toLowerCase()
  for (const [pattern, fallback] of FALLBACK_MESSAGE_MAP) {
    if (pattern.test(lower)) return fallback
  }
  return message
}
