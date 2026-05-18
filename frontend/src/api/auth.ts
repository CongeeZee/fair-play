import client from './client'
import type { AuthResponse } from '../types'

export const register = (name: string, email: string, password: string) =>
  client.post<AuthResponse>('/auth/register', { name, email, password }).then((r) => r.data)

export const login = (email: string, password: string) =>
  client.post<AuthResponse>('/auth/login', { email, password }).then((r) => r.data)

export const googleLogin = (credential: string) =>
  client.post<AuthResponse>('/auth/google', { credential }).then((r) => r.data)

export const logout = (refreshToken: string | null) =>
  client.post('/auth/logout', { refreshToken }).catch(() => {})

export const verifyEmail = (token: string) =>
  client.get<{ message: string }>(`/auth/verify-email/${token}`).then((r) => r.data)

export const resendVerification = () =>
  client.post<{ message: string }>('/auth/resend-verification').then((r) => r.data)

export const completeOnboarding = () =>
  client.patch('/auth/onboarding-complete').then((r) => r.data)
