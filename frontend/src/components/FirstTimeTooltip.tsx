import { useState, useEffect, type ReactNode } from 'react'
import { Popover, Typography, Box, IconButton } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { CLAY, raised, tint } from '../theme'
import { ON_GREEN } from '../scoreColors'

interface Props {
  storageKey: string
  message: string
  children: ReactNode
  /** When true the tooltip never opens (e.g. the hint no longer applies). */
  disabled?: boolean
  anchorOrigin?: { vertical: 'top' | 'bottom'; horizontal: 'left' | 'center' | 'right' }
  transformOrigin?: { vertical: 'top' | 'bottom'; horizontal: 'left' | 'center' | 'right' }
}

export default function FirstTimeTooltip({
  storageKey,
  message,
  children,
  disabled = false,
  anchorOrigin = { vertical: 'bottom', horizontal: 'center' },
  transformOrigin = { vertical: 'top', horizontal: 'center' },
}: Props) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [seen, setSeen] = useState(() => localStorage.getItem(storageKey) === '1')

  useEffect(() => {
    if (seen || disabled) return
    // Small delay so the element renders first
    const timer = setTimeout(() => {
      const el = document.getElementById(storageKey)
      if (el) setAnchorEl(el)
    }, 600)
    return () => clearTimeout(timer)
  }, [seen, disabled, storageKey])

  const handleClose = () => {
    setAnchorEl(null)
    setSeen(true)
    localStorage.setItem(storageKey, '1')
  }

  return (
    <>
      <span id={storageKey}>{children}</span>
      <Popover
        open={!!anchorEl && !seen && !disabled}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={anchorOrigin}
        transformOrigin={transformOrigin}
        disableAutoFocus
        disableEnforceFocus
        slotProps={{ paper: { sx: { p: 1.5, pr: 4, maxWidth: 260, bgcolor: '#2f6b4c', color: '#fff', borderRadius: 2 } } }}
      >
        <Typography variant="body2" sx={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
          {message}
        </Typography>
        <IconButton aria-label="Dismiss tip"
          size="small"
          onClick={handleClose}
          sx={{ position: 'absolute', top: 4, right: 4, color: ON_GREEN.soft }}
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
    <Box sx={{ bgcolor: tint(CLAY.gold, 0.18), boxShadow: raised(3), borderRadius: 2, p: 2, mb: 3, position: 'relative' }}>
      <IconButton aria-label="Dismiss tip" size="small" onClick={handleDismiss} sx={{ position: 'absolute', top: 4, right: 4 }}>
        <CloseIcon sx={{ fontSize: 16 }} />
      </IconButton>
      <Typography variant="body2" color="text.secondary" sx={{ pr: 3 }}>
        {message}
      </Typography>
      {action && <Box sx={{ mt: 1.5 }}>{action}</Box>}
    </Box>
  )
}
