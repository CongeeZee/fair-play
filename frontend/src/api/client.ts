import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { notifyRateLimit } from '../components/RateLimitSnackbar'
import { queueRequest } from '../lib/offlineQueue'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
})

// In-memory access token — never stored in localStorage
let accessToken: string | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken() {
  return accessToken
}

// Attach access token to every request
client.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

// Track whether a refresh is already in progress to avoid multiple concurrent refreshes
let refreshPromise: Promise<string | null> | null = null

async function doRefresh(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refreshToken')
  if (!refreshToken) return null

  try {
    const resp = await axios.post<{ token: string; refreshToken: string }>(
      `${import.meta.env.VITE_API_URL || '/api'}/auth/refresh`,
      { refreshToken },
    )
    const { token, refreshToken: newRefreshToken } = resp.data
    accessToken = token
    localStorage.setItem('refreshToken', newRefreshToken)
    return token
  } catch {
    // Refresh failed — clear everything
    accessToken = null
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
    return null
  }
}

/** Check if a request is a mutating round request that should be queued on network failure */
function isQueueableRoundRequest(config: InternalAxiosRequestConfig): boolean {
  const url = config.url || ''
  const method = (config.method || '').toUpperCase()
  if (method !== 'PUT' && method !== 'POST') return false
  // Match: /rounds, /rounds/:id/holes/:holeId, /rounds/:id/mark-green/:holeId
  return /^\/rounds(\/|$)/.test(url)
}

/** Check if an error is a network error (no response from server) */
function isNetworkError(error: AxiosError): boolean {
  if (!error.response && error.code) {
    return ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(error.code)
  }
  return !error.response && !!error.request
}

// Intercept 401 responses and attempt refresh; queue network errors for round requests
client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status === 429) {
      notifyRateLimit()
      return Promise.reject(error)
    }

    // Queue network errors on round mutations instead of failing
    if (isNetworkError(error) && isQueueableRoundRequest(originalRequest)) {
      const url = originalRequest.url || ''
      const method = (originalRequest.method || 'PUT').toUpperCase()
      const body = originalRequest.data ? JSON.parse(originalRequest.data) : undefined
      await queueRequest(url, method, body)
      // Return a synthetic success so the UI keeps working
      return { data: body, status: 200, statusText: 'OK (queued)', headers: {}, config: originalRequest }
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      // Deduplicate concurrent refresh calls
      if (!refreshPromise) {
        refreshPromise = doRefresh().finally(() => { refreshPromise = null })
      }

      const newToken = await refreshPromise

      if (newToken) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`
        return client(originalRequest)
      }

      // Refresh failed — redirect to login
      window.location.href = '/login'
    }

    return Promise.reject(error)
  }
)

/** Send a raw request — used by flushQueue to replay queued requests */
export async function sendRawRequest(url: string, method: string, body: unknown): Promise<boolean> {
  try {
    await client.request({ url, method, data: body })
    return true
  } catch {
    return false
  }
}

export default client
