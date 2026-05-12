import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { User, AuthResponse } from '../types'
import * as authApi from '../api/auth'
import { setAccessToken } from '../api/client'

interface AuthContextValue {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  googleLogin: (credential: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function handleAuthResponse(data: AuthResponse, setUser: (u: User | null) => void) {
  setAccessToken(data.token)
  localStorage.setItem('refreshToken', data.refreshToken)
  localStorage.setItem('user', JSON.stringify(data.user))
  setUser(data.user)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('user')
    return stored ? JSON.parse(stored) : null
  })

  // On mount, if we have a refresh token, try to get a fresh access token
  useEffect(() => {
    const refreshToken = localStorage.getItem('refreshToken')
    if (!refreshToken || !user) return

    // Silent refresh on page load
    import('../api/client').then(({ default: client }) => {
      client.post<AuthResponse>('/auth/refresh', { refreshToken })
        .then((resp) => {
          setAccessToken(resp.data.token)
          localStorage.setItem('refreshToken', resp.data.refreshToken)
        })
        .catch(() => {
          // Refresh failed — clear session
          setAccessToken(null)
          localStorage.removeItem('refreshToken')
          localStorage.removeItem('user')
          setUser(null)
        })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login(email, password)
    handleAuthResponse(data, setUser)
  }, [])

  const register = useCallback(async (name: string, email: string, password: string) => {
    const data = await authApi.register(name, email, password)
    handleAuthResponse(data, setUser)
  }, [])

  const googleLogin = useCallback(async (credential: string) => {
    const data = await authApi.googleLogin(credential)
    handleAuthResponse(data, setUser)
  }, [])

  const logout = useCallback(() => {
    const refreshToken = localStorage.getItem('refreshToken')
    authApi.logout(refreshToken)
    setAccessToken(null)
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, login, register, googleLogin, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
