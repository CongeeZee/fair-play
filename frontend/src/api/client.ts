import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { notifyRateLimit } from '../components/RateLimitSnackbar'

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

// Intercept 401 responses and attempt refresh
client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status === 429) {
      notifyRateLimit()
      return Promise.reject(error)
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

export default client
