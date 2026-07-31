// ─── Enums ────────────────────────────────────────────────────────────────────

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'BANNED'

// ─── Entities ─────────────────────────────────────────────────────────────────

export interface Permission {
  id: string
  name: string
  description: string | null
  group: string
  createdAt: string
  updatedAt: string
}

export interface Role {
  id: string
  name: string
  description: string | null
  isSystem: boolean
  permissions: Permission[]
  userCount: number
  createdAt: string
  updatedAt: string
}

export interface User {
  id: string
  fullName: string
  email: string
  avatar: string | null
  status: UserStatus
  emailVerified: boolean
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
  roles: (Pick<Role, 'id' | 'name' | 'description'> & { permissions: Pick<Permission, 'id' | 'name'>[] })[]
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface AuthUser {
  id: string
  email: string
}

// ─── API ─────────────────────────────────────────────────────────────────────

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface ApiError {
  message: string | string[]
  statusCode: number
  error?: string
}
