import { Snackbar, Alert } from '@mui/material'
import { useState, useEffect, useCallback } from 'react'

let showNotification: () => void = () => {}

export function notifyRateLimit() {
  showNotification()
}

export default function RateLimitSnackbar() {
  const [open, setOpen] = useState(false)

  const show = useCallback(() => setOpen(true), [])

  useEffect(() => {
    showNotification = show
    return () => { showNotification = () => {} }
  }, [show])

  return (
    <Snackbar
      open={open}
      autoHideDuration={4000}
      onClose={() => setOpen(false)}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
    >
      <Alert severity="warning" onClose={() => setOpen(false)} variant="filled">
        You're doing that too fast. Try again in a moment.
      </Alert>
    </Snackbar>
  )
}
