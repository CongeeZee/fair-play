import { Box, Typography, CircularProgress } from '@mui/material'
import CloudOffIcon from '@mui/icons-material/CloudOff'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import type { SyncState } from '../hooks/useOnlineStatus'

interface OfflineBannerProps {
  syncState: SyncState
  pendingCount: number
}

export default function OfflineBanner({ syncState, pendingCount }: OfflineBannerProps) {
  if (syncState === 'idle') return null

  const config = {
    offline: {
      icon: <CloudOffIcon sx={{ fontSize: 16 }} />,
      text: `You're offline — ${pendingCount > 0 ? `${pendingCount} score${pendingCount > 1 ? 's' : ''} saved locally` : 'scores are saved locally'}`,
      bgcolor: '#e6ae4d',
      color: '#000',
    },
    syncing: {
      icon: <CircularProgress size={14} sx={{ color: '#fff' }} />,
      text: 'Syncing scores...',
      bgcolor: '#5c86a8',
      color: '#fff',
    },
    synced: {
      icon: <CheckCircleIcon sx={{ fontSize: 16 }} />,
      text: 'All scores synced',
      bgcolor: '#4a8a68',
      color: '#fff',
    },
  } as const

  const c = config[syncState]

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        px: 2,
        py: 0.75,
        bgcolor: c.bgcolor,
        color: c.color,
      }}
    >
      {c.icon}
      <Typography variant="caption" sx={{ fontWeight: 600 }}>
        {c.text}
      </Typography>
    </Box>
  )
}
