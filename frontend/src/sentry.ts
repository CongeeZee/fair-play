// Sentry error monitoring (frontend).
//
// Enabled only when VITE_SENTRY_DSN is set, so dev/local stays clean. No
// performance tracing is configured yet — error capture only.

import * as Sentry from '@sentry/react'

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined
const ENVIRONMENT =
  (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ??
  import.meta.env.MODE
const RELEASE = import.meta.env.VITE_SENTRY_RELEASE as string | undefined

let initialised = false

export function initSentry() {
  if (initialised || !DSN) return
  Sentry.init({
    dsn: DSN,
    environment: ENVIRONMENT,
    release: RELEASE,
    // Errors only — no traces.
    tracesSampleRate: 0,
  })
  initialised = true
}

export const ErrorBoundary = Sentry.ErrorBoundary
