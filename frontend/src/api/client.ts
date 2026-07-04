import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { notifyRateLimit } from '../components/RateLimitSnackbar'
import { queueRequest } from '../lib/offlineQueue'
import type { User } from '../types'

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

// Attach access token to every request.
// On a cold boot the access token only lives in memory, so queries that fire
// during first render would otherwise go out unauthenticated, 401, and rely on
// the response interceptor to refresh + retry (noisy and doubles the requests).
// Instead, if we hold a refresh token but no access token yet, wait for the
// shared refresh (deduped with AuthContext's boot refresh) before sending.
client.interceptors.request.use(async (config) => {
  if (!accessToken && localStorage.getItem('refreshToken')) {
    await refreshAccessToken()
  }
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

export type RefreshResult =
  | { status: 'ok'; token: string; user: User }
  // The server explicitly rejected the refresh token — session is over.
  | { status: 'invalid' }
  // Rate limit / network / server hiccup — the session may still be fine,
  // so we must NOT log the user out.
  | { status: 'transient' }

// Track whether a refresh is already in progress to avoid multiple concurrent refreshes
// Shared between the 401 interceptor and AuthContext's silent refresh on page load.
let refreshPromise: Promise<RefreshResult> | null = null

async function doRefresh(): Promise<RefreshResult> {
  const refreshToken = localStorage.getItem('refreshToken')
  if (!refreshToken) return { status: 'invalid' }

  try {
    const resp = await axios.post<{ token: string; refreshToken: string; user: User }>(
      `${import.meta.env.VITE_API_URL || '/api'}/auth/refresh`,
      { refreshToken },
    )
    const { token, refreshToken: newRefreshToken, user } = resp.data
    accessToken = token
    localStorage.setItem('refreshToken', newRefreshToken)
    localStorage.setItem('user', JSON.stringify(user))
    return { status: 'ok', token, user }
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined
    // Only treat an explicit auth rejection as "session over". A 429
    // (rate limit), 5xx, or network error must not wipe a valid session —
    // that was logging users out spuriously.
    if (status === 401 || status === 403) {
      accessToken = null
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('user')
      return { status: 'invalid' }
    }
    if (status === 429) notifyRateLimit()
    return { status: 'transient' }
  }
}

/** Refresh the access token, deduplicating concurrent callers. */
export function refreshAccessToken(): Promise<RefreshResult> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

/** Check if a request is a mutating round request that should be queued on network failure */
function isQueueableRoundRequest(config: InternalAxiosRequestConfig): boolean {
  const url = config.url || ''
  const method = (config.method || '').toUpperCase()
  if (method !== 'PUT' && method !== 'POST') return false
  // Match: /rounds, /rounds/:id/holes/:holeId
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

      const result = await refreshAccessToken()

      if (result.status === 'ok') {
        originalRequest.headers.Authorization = `Bearer ${result.token}`
        return client(originalRequest)
      }

      // Only force a login when the session is definitively dead.
      // Transient refresh failures just reject the request — react-query
      // retries will pick it up once the API recovers.
      if (result.status === 'invalid') {
        window.location.href = '/login'
      }
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
