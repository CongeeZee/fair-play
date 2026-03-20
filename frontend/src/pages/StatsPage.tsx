import {
  Box, Container, Typography, CircularProgress, Alert,
  Grid, Card, CardContent, Divider, LinearProgress
} from '@mui/material'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import BarChartIcon from '@mui/icons-material/BarChart'
import { useQuery } from '@tanstack/react-query'
import { getStats } from '../api/rounds'

function formatScore(val: number | undefined) {
  if (val == null) return '–'
  if (val === 0) return 'E'
  return val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1)
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Card elevation={1} sx={{ height: '100%' }}>
      <CardContent sx={{ textAlign: 'center', py: 3 }}>
        <Typography variant="h3" sx={{ color: color ?? 'primary.main', mb: 0.5 }}>
          {value}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </CardContent>
    </Card>
  )
}

export default function StatsPage() {
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['stats'],
    queryFn: getStats,
  })

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">Failed to load stats.</Alert>
      </Container>
    )
  }

  if (!stats || stats.roundsPlayed === 0) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography variant="h4" color="primary.main" gutterBottom>Stats</Typography>
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <BarChartIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
          <Typography color="text.secondary">No rounds played yet.</Typography>
          <Typography variant="body2" color="text.secondary">
            Complete some rounds to see your stats here.
          </Typography>
        </Box>
      </Container>
    )
  }

  const breakdown = stats.holeBreakdown
  const totalHoles = breakdown
    ? breakdown.eagles + breakdown.birdies + breakdown.pars + breakdown.bogeys + breakdown.doublesOrWorse
    : 0

  const breakdownItems = breakdown
    ? [
        { label: 'Eagles', value: breakdown.eagles, color: '#c9a84c' },
        { label: 'Birdies', value: breakdown.birdies, color: '#2d5e42' },
        { label: 'Pars', value: breakdown.pars, color: '#4a5e4a' },
        { label: 'Bogeys', value: breakdown.bogeys, color: '#e6a817' },
        { label: 'Double+', value: breakdown.doublesOrWorse, color: '#c62828' },
      ]
    : []

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <EmojiEventsIcon sx={{ color: 'secondary.main', fontSize: 32 }} />
        <Typography variant="h4" color="primary.main">Stats</Typography>
      </Box>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard label="Rounds Played" value={String(stats.roundsPlayed)} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard
            label="Average Score"
            value={formatScore(stats.averageScoreToPar)}
            color={
              stats.averageScoreToPar == null ? undefined
              : stats.averageScoreToPar < 0 ? '#2d5e42'
              : stats.averageScoreToPar === 0 ? '#4a5e4a'
              : '#c62828'
            }
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard
            label="Best Round"
            value={formatScore(stats.bestScoreToPar)}
            color={stats.bestScoreToPar != null && stats.bestScoreToPar < 0 ? '#c9a84c' : '#2d5e42'}
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard
            label="Worst Round"
            value={formatScore(stats.worstScoreToPar)}
            color="#c62828"
          />
        </Grid>
      </Grid>

      {breakdown && totalHoles > 0 && (
        <Card elevation={1}>
          <CardContent>
            <Typography variant="h6" color="primary.main" gutterBottom>
              Hole Breakdown
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Based on {totalHoles} holes played
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {breakdownItems.map(({ label, value, color }) => (
                <Box key={label}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="body2" fontWeight={600} sx={{ color }}>
                      {label}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {value} ({totalHoles > 0 ? ((value / totalHoles) * 100).toFixed(0) : 0}%)
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={totalHoles > 0 ? (value / totalHoles) * 100 : 0}
                    sx={{
                      height: 8,
                      borderRadius: 4,
                      bgcolor: 'grey.200',
                      '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 4 },
                    }}
                  />
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}
    </Container>
  )
}
