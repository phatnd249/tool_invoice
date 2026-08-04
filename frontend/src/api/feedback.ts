import { apiClient } from '@/lib/apiClient'

export interface CreateFeedbackPayload {
  title: string
  content: string
  category: string
}

export const feedbackApi = {
  send: (data: CreateFeedbackPayload) =>
    apiClient.post<{ message: string }>('/feedback', data),
}
