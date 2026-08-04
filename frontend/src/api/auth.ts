import { apiClient } from '@/lib/apiClient'
import type { AuthTokens } from '@/types'

export const authApi = {
  register: (data: {
    fullName: string
    email: string
    password: string
    confirmPassword: string
  }) => apiClient.post<{ message: string }>('/auth/register', data),

  login: (data: { email: string; password: string }) =>
    apiClient.post<AuthTokens>('/auth/login', data),

  logout: (refreshToken: string) =>
    apiClient.post<{ message: string }>('/auth/logout', { refreshToken }),

  logoutAll: () =>
    apiClient.post<{ message: string }>('/auth/logout-all'),

  refresh: (refreshToken: string) =>
    apiClient.post<AuthTokens>('/auth/refresh', { refreshToken }),

  forgotPassword: (email: string) =>
    apiClient.post<{ message: string }>('/auth/forgot-password', { email }),

  resetPassword: (data: { token: string; password: string; confirmPassword: string }) =>
    apiClient.post<{ message: string }>('/auth/reset-password', data),

  verifyEmail: (token: string) =>
    apiClient.get<{ message: string }>(`/auth/verify-email?token=${token}`),

  resendVerification: (email: string) =>
    apiClient.post<{ message: string }>('/auth/resend-verification', { email }),
}
