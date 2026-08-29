import { useEffect, useState, useRef } from 'react'
import { Snackbar, Paper, Box, Typography, IconButton } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import type { NewlyUnlockedAchievement } from '../types'
import { ON_GREEN } from '../scoreColors'

interface Props {
  queue: NewlyUnlockedAchievement[]
  onClear: () => void
}

const DISPLAY_MS = 4000

export default function AchievementUnlockOverlay({ queue, onClear }: Props) {
  const [current, setCurrent] = useState<NewlyUnlockedAchievement | null>(null)
  const indexRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (queue.length === 0) return
    indexRef.current = 0
    setCurrent(queue[0])
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue])

  const advance = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    indexRef.current += 1
    if (indexRef.current >= queue.length) {
      setCurrent(null)
      onClear()
    } else {
      setCurrent(queue[indexRef.current])
    }
  }

  return (
    <Snackbar
      open={current != null}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      autoHideDuration={DISPLAY_MS}
      onClose={(_, reason) => {
        if (reason === 'clickaway') return
        advance()
      }}
      sx={{ mt: { xs: 1, sm: 2 } }}
    >
      {current ? (
        <Paper
          elevation={6}
          onClick={advance}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 1.75,
            py: 1.25,
            minWidth: 280,
            maxWidth: 380,
            borderRadius: 2,
            bgcolor: '#2f6b4c',
            color: '#fff',
            cursor: 'pointer',
            borderLeft: `4px solid ${ON_GREEN.gold}`,
          }}
        >
          <Box sx={{ fontSize: '1.75rem', lineHeight: 1, flexShrink: 0 }}>
            {current.emoji}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="caption"
              sx={{ color: ON_GREEN.gold, fontWeight: 700, letterSpacing: 1, display: 'block', lineHeight: 1.2 }}
            >
              Achievement Unlocked
            </Typography>
            <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.25 }} noWrap>
              {current.name}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.8, lineHeight: 1.2, display: 'block' }} noWrap>
              {current.description}
            </Typography>
          </Box>
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); advance() }}
            sx={{ color: ON_GREEN.soft, flexShrink: 0 }}
            aria-label="Dismiss achievement"
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Paper>
      ) : <div />}
    </Snackbar>
  )
}
