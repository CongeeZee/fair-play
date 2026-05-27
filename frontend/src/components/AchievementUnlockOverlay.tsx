import { useEffect, useState, useRef } from 'react'
import { Box, Typography } from '@mui/material'
import type { NewlyUnlockedAchievement } from '../types'

interface Props {
  queue: NewlyUnlockedAchievement[]
  onClear: () => void
}

const DISPLAY_MS = 3000
const GAP_MS = 2000

export default function AchievementUnlockOverlay({ queue, onClear }: Props) {
  const [current, setCurrent] = useState<NewlyUnlockedAchievement | null>(null)
  const [visible, setVisible] = useState(false)
  const indexRef = useRef(0)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    if (queue.length === 0) return

    indexRef.current = 0
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []

    const showNext = () => {
      if (indexRef.current >= queue.length) {
        setCurrent(null)
        setVisible(false)
        onClear()
        return
      }
      setCurrent(queue[indexRef.current])
      setVisible(true)
      timersRef.current.push(setTimeout(() => setVisible(false), DISPLAY_MS))
      timersRef.current.push(setTimeout(() => {
        indexRef.current += 1
        showNext()
      }, DISPLAY_MS + GAP_MS))
    }
    showNext()

    return () => {
      timersRef.current.forEach(clearTimeout)
      timersRef.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue])

  const handleDismiss = () => {
    setVisible(false)
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    indexRef.current += 1
    if (indexRef.current >= queue.length) {
      setCurrent(null)
      onClear()
      return
    }
    timersRef.current.push(setTimeout(() => {
      const next = queue[indexRef.current]
      setCurrent(next)
      setVisible(true)
      timersRef.current.push(setTimeout(() => setVisible(false), DISPLAY_MS))
      timersRef.current.push(setTimeout(() => {
        indexRef.current += 1
        if (indexRef.current >= queue.length) {
          setCurrent(null)
          onClear()
        }
      }, DISPLAY_MS + GAP_MS))
    }, GAP_MS / 4))
  }

  if (!current) return null

  return (
    <Box
      onClick={handleDismiss}
      sx={{
        position: 'fixed',
        inset: 0,
        bgcolor: 'rgba(0, 0, 0, 0.65)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        opacity: visible ? 1 : 0,
        transition: 'opacity 250ms ease',
      }}
    >
      <Box
        sx={{
          textAlign: 'center',
          color: '#fff',
          px: 3,
          transform: visible ? 'scale(1)' : 'scale(0.85)',
          opacity: visible ? 1 : 0,
          transition: 'transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 250ms ease',
        }}
      >
        <Typography
          variant="overline"
          sx={{ color: '#c9a84c', fontWeight: 700, letterSpacing: 2 }}
        >
          Achievement Unlocked
        </Typography>
        <Typography sx={{ fontSize: '6rem', lineHeight: 1, my: 1.5 }}>
          {current.emoji}
        </Typography>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
          {current.name}
        </Typography>
        <Typography variant="body1" sx={{ opacity: 0.85, maxWidth: 320, mx: 'auto' }}>
          {current.description}
        </Typography>
      </Box>
    </Box>
  )
}
