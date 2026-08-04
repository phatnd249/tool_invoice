import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { authApi } from '@/api/auth'
import { usersApi } from '@/api/users'
import { tokenStore } from '@/lib/apiClient'
import type { User } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  hasPermission: (permission: string) => boolean
  hasRole: (roleName: string) => boolean
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    const { data } = await usersApi.getProfile()
    setUser(data)
  }, [])

  // Restore session on mount
  useEffect(() => {
    const restore = async () => {
      const accessToken = tokenStore.getAccess()
      const refreshToken = tokenStore.getRefresh()

      if (!accessToken && !refreshToken) {
        setIsLoading(false)
        return
      }

      // If we have an access token, try to get user profile directly
      if (accessToken) {
        try {
          await refreshUser()
          setIsLoading(false)
          return
        } catch {
          // Access token expired, try refresh
          tokenStore.setAccess(null)
        }
      }

      // Try to refresh tokens
      if (refreshToken) {
        try {
          const { data } = await authApi.refresh(refreshToken)
          tokenStore.setAccess(data.accessToken)
          tokenStore.setRefresh(data.refreshToken)
          await refreshUser()
        } catch {
          tokenStore.clear()
        }
      }

      setIsLoading(false)
    }
    restore()
  }, [refreshUser])

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await authApi.login({ email, password })
    tokenStore.setAccess(data.accessToken)
    tokenStore.setRefresh(data.refreshToken)
    await refreshUser()
  }, [refreshUser])

  const logout = useCallback(async () => {
    const refreshToken = tokenStore.getRefresh()
    if (refreshToken) {
      try { await authApi.logout(refreshToken) } catch { /* ignore */ }
    }
    tokenStore.clear()
    setUser(null)
  }, [])

  const hasPermission = useCallback(
    (permission: string) =>
      user?.roles.some((role) =>
        role.permissions?.some((p) => p.name === permission),
      ) ?? false,
    [user],
  )

  const hasRole = useCallback(
    (roleName: string) => user?.roles.some((r) => r.name === roleName) ?? false,
    [user],
  )

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        refreshUser,
        hasPermission,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
