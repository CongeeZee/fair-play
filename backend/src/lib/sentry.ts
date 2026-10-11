// Sentry error monitoring (backend).
//
// Enabled only when SENTRY_DSN is set, so dev/local stays clean. Errors only,
// no performance tracing. Sensitive headers and request bodies are scrubbed in
// `beforeSend` so auth tokens never end up on the Sentry dashboard.

import * as Sentry from "@sentry/node";
import type { ErrorRequestHandler } from "express";

const DSN = process.env.SENTRY_DSN;

let initialised = false;

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
  "proxy-authorization",
]);

const SENSITIVE_BODY_KEYS = new Set([
  "password",
  "newpassword",
  "currentpassword",
  "refreshtoken",
  "token",
  "credential",
  "passwordresettoken",
  "verificationtoken",
]);

function scrubObject<T extends Record<string, unknown>>(
  obj: T,
  sensitiveKeys: Set<string>,
): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = sensitiveKeys.has(k.toLowerCase()) ? "[Filtered]" : v;
  }
  return out as T;
}

export function initSentry() {
  if (initialised || !DSN) return;

  Sentry.init({
    dsn: DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      // Scrub auth headers + cookies
      if (event.request?.headers) {
        event.request.headers = scrubObject(
          event.request.headers as Record<string, unknown>,
          SENSITIVE_HEADERS,
        ) as typeof event.request.headers;
      }
      // Scrub known credential fields in request bodies
      if (event.request?.data && typeof event.request.data === "object") {
        event.request.data = scrubObject(
          event.request.data as Record<string, unknown>,
          SENSITIVE_BODY_KEYS,
        );
      }
      return event;
    },
  });
  initialised = true;
}

export function isSentryEnabled(): boolean {
  return initialised;
}

/**
 * Express error-handling middleware. Must be registered AFTER all routes.
 * Captures the error in Sentry (when enabled) and forwards a generic 500.
 */
export const sentryErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // Client errors raised by middleware — a body over the size limit (413),
  // malformed JSON (400) — carry their own status and a safe message
  // (`expose`). They used to come back as a 500 and be reported as crashes.
  const status = Number(err?.status ?? err?.statusCode)
  if (status >= 400 && status < 500 && !res.headersSent) {
    res.status(status).json({ error: err.expose && err.message ? err.message : "Bad request" })
    return
  }
  if (initialised) {
    Sentry.withScope((scope) => {
      scope.setTag("path", req.path);
      scope.setTag("method", req.method);
      Sentry.captureException(err);
    });
  }
  if (res.headersSent) {
    next(err);
    return;
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
};
