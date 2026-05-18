import { useState, useEffect, type ReactNode } from 'react'
import { Popover, Typography, Box, IconButton } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'

interface Props {
  storageKey: string
  message: string
  children: ReactNode
  anchorOrigin?: { vertical: 'top' | 'bottom'; horizontal: 'left' | 'center' | 'right' }
  transformOrigin?: { vertical: 'top' | 'bottom'; horizontal: 'left' | 'center' | 'right' }
}

export default function FirstTimeTooltip({
  storageKey,
  message,
  children,
  anchorOrigin = { vertical: 'bottom', horizontal: 'center' },
  transformOrigin = { vertical: 'top', horizontal: 'center' },
}: Props) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [seen, setSeen] = useState(() => localStorage.getItem(storageKey) === '1')

  useEffect(() => {
    if (seen) return
    // Small delay so the element renders first
    const timer = setTimeout(() => {
      const el = document.getElementById(storageKey)
      if (el) setAnchorEl(el)
    }, 600)
    return () => clearTimeout(timer)
  }, [seen, storageKey])

  const handleClose = () => {
    setAnchorEl(null)
    setSeen(true)
    localStorage.setItem(storageKey, '1')
  }

  return (
    <>
      <span id={storageKey}>{children}</span>
      <Popover
        open={!!anchorEl && !seen}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={anchorOrigin}
        transformOrigin={transformOrigin}
        disableAutoFocus
        disableEnforceFocus
        slotProps={{ paper: { sx: { p: 1.5, pr: 4, maxWidth: 260, bgcolor: '#1a3a2a', color: '#fff', borderRadius: 2 } } }}
      >
        <Typography variant="body2" sx={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
          {message}
        </Typography>
        <IconButton
          size="small"
          onClick={handleClose}
          sx={{ position: 'absolute', top: 4, right: 4, color: 'rgba(255,255,255,0.6)' }}
        >
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Popover>
    </>
  )
}

export function FirstTimeCard({ storageKey, message, action }: { storageKey: string; message: string; action?: ReactNode }) {
  const [seen, setSeen] = useState(() => localStorage.getItem(storageKey) === '1')

  if (seen) return null

  const handleDismiss = () => {
    setSeen(true)
    localStorage.setItem(storageKey, '1')
  }

  return (
    <Box sx={{ bgcolor: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 2, p: 2, mb: 3, position: 'relative' }}>
      <IconButton size="small" onClick={handleDismiss} sx={{ position: 'absolute', top: 4, right: 4 }}>
        <CloseIcon sx={{ fontSize: 16 }} />
      </IconButton>
      <Typography variant="body2" color="text.secondary" sx={{ pr: 3 }}>
        {message}
      </Typography>
      {action && <Box sx={{ mt: 1.5 }}>{action}</Box>}
    </Box>
  )
}
