import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { User, AuthResponse } from '../types'
import * as authApi from '../api/auth'
import { setAccessToken, refreshAccessToken } from '../api/client'
import { identify, resetAnalytics, capture, AnalyticsEvent } from '../analytics'

interface AuthContextValue {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  googleLogin: (credential: string) => Promise<void>
  markEmailVerified: () => void
  markOnboardingComplete: () => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function handleAuthResponse(data: AuthResponse, setUser: (u: User | null) => void) {
  setAccessToken(data.token)
  localStorage.setItem('refreshToken', data.refreshToken)
  localStorage.setItem('user', JSON.stringify(data.user))
  setUser(data.user)
  identify(data.user.id)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('user')
    return stored ? JSON.parse(stored) : null
  })

  // On mount, if we have a refresh token, try to get a fresh access token.
  // Uses the shared refreshAccessToken so it dedupes with any 401-triggered refresh
  // that may fire in parallel from other components mounting.
  useEffect(() => {
    // Re-identify on every reload for already-signed-in sessions
    if (user) identify(user.id)

    const refreshToken = localStorage.getItem('refreshToken')
    if (!refreshToken || !user) return

    refreshAccessToken().then((result) => {
      if (result.status === 'ok') {
        setUser(result.user)
      } else if (result.status === 'invalid') {
        setUser(null)
      }
      // 'transient' — keep the stored user; the 401 interceptor will
      // retry the refresh when the API is reachable again.
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
    capture(AnalyticsEvent.SignupCompleted, { method: 'email' })
  }, [])

  const googleLogin = useCallback(async (credential: string) => {
    // We can't tell from the response alone whether this Google sign-in created
    // a new user or signed an existing one in. We treat the first ever Google
    // sign-in for this browser as a signup (good enough for activation funnels)
    // by checking whether we'd previously stored a user.
    const isFirstAuth = !localStorage.getItem('user')
    const data = await authApi.googleLogin(credential)
    handleAuthResponse(data, setUser)
    if (isFirstAuth) {
      capture(AnalyticsEvent.SignupCompleted, { method: 'google' })
    }
  }, [])

  const markEmailVerified = useCallback(() => {
    setUser((prev) => {
      if (!prev) return prev
      const updated = { ...prev, emailVerified: true }
      localStorage.setItem('user', JSON.stringify(updated))
      return updated
    })
  }, [])

  const markOnboardingComplete = useCallback(() => {
    setUser((prev) => {
      if (!prev) return prev
      const updated = { ...prev, hasCompletedOnboarding: true }
      localStorage.setItem('user', JSON.stringify(updated))
      return updated
    })
  }, [])

  const logout = useCallback(() => {
    const refreshToken = localStorage.getItem('refreshToken')
    authApi.logout(refreshToken)
    setAccessToken(null)
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
    setUser(null)
    resetAnalytics()
  }, [])

  return (
    <AuthContext.Provider value={{ user, login, register, googleLogin, markEmailVerified, markOnboardingComplete, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
