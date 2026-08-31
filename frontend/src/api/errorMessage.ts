/**
 * Pull a renderable string out of an API error.
 *
 * Call sites used to do `err.response?.data?.error ?? fallback` and hand the
 * result straight to an `<Alert>`. The type said `error?: string`, but the
 * server's 400 handler sent zod's `fieldErrors` — an object of arrays. React
 * refuses to render an object as a child, so the throw escaped the page and
 * unmounted the app into the root ErrorBoundary: an email Chrome accepts but
 * zod rejects (`test@test`) turned the sign-in form into
 * "Something went wrong. Please reload the page."
 *
 * The server now always sends a string, but a stale deploy, a proxy error page
 * or any route we haven't audited can still put a non-string on `error` — so
 * normalise here too, and never let the shape of an error message be able to
 * take a page down.
 */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: unknown } })?.response?.data
  const raw = (data as { error?: unknown } | undefined)?.error

  if (typeof raw === 'string' && raw.trim()) return raw
  if (Array.isArray(raw)) {
    const joined = raw.filter((m) => typeof m === 'string').join('. ')
    if (joined) return joined
  }
  // zod's `flatten().fieldErrors` shape: { email: ["Invalid email"], ... }
  if (raw && typeof raw === 'object') {
    const joined = Object.values(raw as Record<string, unknown>)
      .flat()
      .filter((m): m is string => typeof m === 'string' && m.length > 0)
      .join('. ')
    if (joined) return joined
  }
  return fallback
}
