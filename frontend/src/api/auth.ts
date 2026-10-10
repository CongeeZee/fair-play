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

export const forgotPassword = (email: string) =>
  client
    .post<{ message: string }>('/auth/forgot-password', { email })
    .then((r) => r.data)

export const resetPassword = (token: string, newPassword: string) =>
  client
    .post<{ message: string }>('/auth/reset-password', { token, newPassword })
    .then((r) => r.data)

export interface AccountInfo {
  email: string
  hasPassword: boolean
  googleLinked: boolean
  createdAt: string
}

export const getAccount = () =>
  client.get<AccountInfo>('/auth/account').then((r) => r.data)

/** Keeps this device signed in; every other session is ended. */
export const changePassword = (newPassword: string, currentPassword?: string) =>
  client
    .post('/auth/change-password', { currentPassword, newPassword, refreshToken: localStorage.getItem('refreshToken') })
    .then((r) => r.data)

export const deleteAccount = (password?: string) =>
  client.delete('/auth/account', { data: { confirm: 'DELETE', password } }).then((r) => r.data)
