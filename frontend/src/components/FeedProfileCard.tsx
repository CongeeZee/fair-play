import { Box, Button, Paper, Typography } from '@mui/material'
import SportsGolfIcon from '@mui/icons-material/SportsGolf'
import EditCalendarIcon from '@mui/icons-material/EditCalendar'
import InsightsIcon from '@mui/icons-material/Insights'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getHandicap, getStats } from '../api/rounds'
import { useAuth } from '../contexts/AuthContext'
import UserAvatar from './UserAvatar'
import { formatHandicap } from '../utils'
import { HEADING_FONT } from '../theme'

function toPar(n: number | null | undefined) {
  if (n == null) return '–'
  if (n === 0) return 'E'
  return n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1)
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
      <Typography className="tabular" sx={{ fontFamily: HEADING_FONT, fontWeight: 800, fontSize: '1.25rem', lineHeight: 1.2 }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Box>
  )
}

/**
 * Left rail of wide-screen pages: who you are, your numbers, and the three
 * things you most often come to do. Shares its queries with the Stats page
 * (and the on-device cache), so it costs nothing extra after a first visit.
 * Pass `actions={false}` on pages where those shortcuts would point at itself.
 */
export default function FeedProfileCard({ actions = true }: { actions?: boolean }) {
  const { user } = useAuth()
  const { data: handicap } = useQuery({ queryKey: ['handicap'], queryFn: getHandicap })
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: getStats })
  if (!user) return null

  return (
    <Box>
      <Paper elevation={0} sx={{ p: 2.5, mb: 2, textAlign: 'center' }}>
        <UserAvatar userId={Number(user.id)} name={user.name} size={64} sx={{ mx: 'auto', mb: 1, fontSize: '1.4rem' }} />
        <Typography variant="h6" noWrap>{user.name}</Typography>
        <Box sx={{ display: 'flex', mt: 2, pt: 2, borderTop: '1px solid var(--c-borderC)' }}>
          <Figure label="Handicap" value={handicap?.handicapIndex != null ? formatHandicap(handicap.handicapIndex) : '–'} />
          <Figure label="Rounds" value={String(stats?.roundsPlayed ?? '–')} />
          <Figure label="Average" value={toPar(stats?.averageScoreToPar)} />
        </Box>
      </Paper>

      {actions && <Paper elevation={0} sx={{ p: 1.5, mb: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Button component={Link} to="/play" variant="contained" startIcon={<SportsGolfIcon />} fullWidth>
          Start a round
        </Button>
        <Button component={Link} to="/play" variant="outlined" startIcon={<EditCalendarIcon />} fullWidth>
          Log a past round
        </Button>
        <Button component={Link} to="/stats" startIcon={<InsightsIcon />} fullWidth>
          Your stats
        </Button>
      </Paper>}
    </Box>
  )
}
