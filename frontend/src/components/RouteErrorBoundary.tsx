import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Box, Typography, Button, Alert } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'

/**
 * A boundary around the routed page only.
 *
 * Before this existed the app's single boundary was the one in `main.tsx`,
 * wrapped around `<App />`. Anything that threw while rendering a page —
 * including a lazy chunk that failed to download — unmounted the entire tree
 * and replaced it with "Something went wrong. Please reload the page.": no
 * navigation, no error text, and no way back except a manual reload that hits
 * the same failure again.
 *
 * Scoping a boundary to the page keeps the navbar and bottom nav mounted, so
 * the user can leave a broken page instead of being stranded on it, and gives
 * them a Try again that re-renders rather than reloads. The root boundary
 * stays where it is as the last resort for a failure in the chrome itself.
 */

/**
 * A dynamic `import()` that fails throws a plain TypeError whose message
 * varies by browser, so this matches on the shapes the bundlers and browsers
 * actually produce. It matters because the fix differs: a chunk that 404s
 * after a redeploy is stale-client, and only a hard reload (which re-fetches
 * index.html and its new asset hashes) can recover it. Re-rendering would
 * just re-import the same missing URL.
 */
function isChunkLoadError(error: Error): boolean {
  const msg = `${error.name}: ${error.message}`
  return (
    /ChunkLoadError/i.test(msg) ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  )
}

/**
 * Guard against a reload loop: if a hard reload does not fix the chunk error
 * (the asset really is gone, or the service worker keeps serving a stale
 * index.html), we must show the error rather than reload forever.
 */
const RELOAD_FLAG = 'fairplay:chunk-reloaded'

interface Props {
  children: ReactNode
  /** Changing this resets the boundary — the router passes the pathname. */
  resetKey: string
}

interface State {
  error: Error | null
}

export default class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidUpdate(prev: Props) {
    // Navigating away from a page that threw should clear the error, or the
    // user stays stuck on the fallback after clicking a nav link.
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the component stack in the console: the fallback below deliberately
    // does not print it, and without this the stack is lost entirely.
    console.error('Route error:', error, info.componentStack)

    if (isChunkLoadError(error)) {
      let alreadyTried = true
      try {
        alreadyTried = sessionStorage.getItem(RELOAD_FLAG) === '1'
        if (!alreadyTried) sessionStorage.setItem(RELOAD_FLAG, '1')
      } catch {
        // Storage unavailable (private mode): treat as already tried rather
        // than risk an unbreakable reload loop.
      }
      if (!alreadyTried) window.location.reload()
    }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const stale = isChunkLoadError(error)

    return (
      <Box sx={{ maxWidth: 520, mx: 'auto', px: 2, py: 8, textAlign: 'center' }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
          {stale ? 'This page failed to load' : "This page hit a problem"}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {stale
            ? 'A newer version of Fairplay has been released, or the connection dropped part-way through loading it.'
            : 'The rest of the app is still fine — you can go back, or try this page again.'}
        </Typography>
        <Alert severity="error" sx={{ mb: 3, textAlign: 'left' }}>
          {error.message || String(error)}
        </Alert>
        <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            startIcon={<RefreshIcon />}
            onClick={() => {
              if (stale) {
                try {
                  sessionStorage.removeItem(RELOAD_FLAG)
                } catch {
                  // Non-fatal; the reload below still happens.
                }
                window.location.reload()
              } else {
                this.setState({ error: null })
              }
            }}
            sx={{ textTransform: 'none' }}
          >
            {stale ? 'Reload' : 'Try again'}
          </Button>
          <Button
            variant="outlined"
            onClick={() => window.history.back()}
            sx={{ textTransform: 'none' }}
          >
            Go back
          </Button>
        </Box>
      </Box>
    )
  }
}
