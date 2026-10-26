import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { http, setUnauthorizedHandler, tokenStore } from '../api/client'
import type { LoginResponse, User, UserRole } from '../api/types'

interface AuthState {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  hasRole: (...roles: UserRole[]) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const qc = useQueryClient()

  const logout = useCallback(() => {
    tokenStore.set(null)
    setUser(null)
    qc.clear()
  }, [qc])

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
    if (!tokenStore.get()) {
      setLoading(false)
      return
    }
    http
      .get<User>('/auth/me')
      .then(setUser)
      .catch(() => tokenStore.set(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const res = await http.post<LoginResponse>('/auth/login', { username, password })
    tokenStore.set(res.token)
    setUser(res.user)
  }, [])

  const hasRole = useCallback((...roles: UserRole[]) => !!user && roles.includes(user.role), [user])

  const value = useMemo(() => ({ user, loading, login, logout, hasRole }), [user, loading, login, logout, hasRole])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth mesti digunakan dalam AuthProvider')
  return ctx
}

export const roleLabels: Record<UserRole, string> = {
  Manager: 'Pengurus',
  Clerk: 'Kerani',
}
