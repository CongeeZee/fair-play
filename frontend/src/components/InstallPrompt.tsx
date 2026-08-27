import { useEffect, useState } from 'react'
import { Snackbar, Button, IconButton, Box, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'

// Chrome/Edge/Android fire `beforeinstallprompt` when the PWA install criteria
// are met. We capture it, surface a subtle Snackbar CTA, and replay the prompt
// when the user opts in. iOS Safari never fires this event, so installation
// there relies on the user's Share → Add to Home Screen flow.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'fairplay.installPromptDismissedAt'
// Stay quiet for 14 days after dismissal so we don't nag.
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000

function recentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const ts = Number(raw)
    if (!Number.isFinite(ts)) return false
    return Date.now() - ts < DISMISS_TTL_MS
  } catch {
    return false
  }
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  // iOS Safari exposes a non-standard navigator.standalone flag.
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return

    const onBeforeInstall = (event: Event) => {
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
      setOpen(true)
    }
    const onInstalled = () => {
      setOpen(false)
      setDeferred(null)
      try {
        localStorage.removeItem(DISMISS_KEY)
      } catch {
        /* ignore */
      }
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const dismiss = () => {
    setOpen(false)
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      /* ignore */
    }
  }

  const install = async () => {
    if (!deferred) return
    setOpen(false)
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    if (outcome === 'dismissed') {
      try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()))
      } catch {
        /* ignore */
      }
    }
    setDeferred(null)
  }

  return (
    <Snackbar
      open={open}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      sx={{ mb: { xs: 'calc(72px + env(safe-area-inset-bottom, 0px))', md: 2 } }}
      message={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2">Install Fairplay for one-tap access on the course.</Typography>
        </Box>
      }
      action={
        <>
          {/* The Snackbar sits on a near-black surface, so primary (dark green)
              rendered the label all but invisible. Gold is the accent that
              actually reads against it. */}
          <Button color="secondary" size="small" onClick={install} sx={{ fontWeight: 600 }}>
            Install
          </Button>
          <IconButton size="small" aria-label="Dismiss install prompt" color="inherit" onClick={dismiss}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </>
      }
    />
  )
}
