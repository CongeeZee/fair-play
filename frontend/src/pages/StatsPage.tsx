import {
  Box, Container, Typography, CircularProgress, Alert,
  Grid, Card, CardContent, Divider, LinearProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip
} from '@mui/material'
import BarChartIcon from '@mui/icons-material/BarChart'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import TrendingDownIcon from '@mui/icons-material/TrendingDown'
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat'
import { useQuery } from '@tanstack/react-query'
import { getStats, getHandicap, getRounds } from '../api/rounds'
import { formatCourseName } from '../utils'
import PageHeader from '../components/PageHeader'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Dot
} from 'recharts'
import type { Round } from '../types'

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

// ── Form/Improvement Card ────────────────────────────────────────────────────
function ImprovementCard({ rounds }: { rounds: Round[] }) {
  const eligible = rounds
    .filter((r) => r.scoreToPar != null && r.holesCompleted != null && r.holesCompleted > 0)
    .slice()
    .sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime())

  if (eligible.length < 4) return null

  const recent = eligible.slice(0, Math.min(5, Math.floor(eligible.length / 2)))
  const previous = eligible.slice(recent.length, recent.length * 2)

  if (previous.length === 0) return null

  const avgRecent = recent.reduce((s, r) => s + r.scoreToPar!, 0) / recent.length
  const avgPrev = previous.reduce((s, r) => s + r.scoreToPar!, 0) / previous.length
  const delta = avgRecent - avgPrev // negative = improved (lower score = better)

  const improved = delta < -0.4
  const declined = delta > 0.4

  const TrendIcon = improved ? TrendingDownIcon : declined ? TrendingUpIcon : TrendingFlatIcon
  const trendColor = improved ? '#2d5e42' : declined ? '#c62828' : '#4a5e4a'
  const trendBg = improved ? 'rgba(45,94,66,0.1)' : declined ? 'rgba(198,40,40,0.08)' : 'rgba(74,94,74,0.08)'
  const label = improved
    ? `${Math.abs(delta).toFixed(1)} strokes better`
    : declined
    ? `${Math.abs(delta).toFixed(1)} strokes worse`
    : 'Holding steady'
  const sub = `Last ${recent.length} rounds vs previous ${previous.length}`

  return (
    <Card elevation={1} sx={{ mb: 4, bgcolor: trendBg, border: '1px solid', borderColor: improved ? 'rgba(45,94,66,0.2)' : declined ? 'rgba(198,40,40,0.2)' : 'rgba(74,94,74,0.15)' }}>
      <CardContent sx={{ py: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ bgcolor: trendColor, borderRadius: '50%', p: 1.25, display: 'flex', flexShrink: 0 }}>
            <TrendIcon sx={{ color: '#fff', fontSize: 22 }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1.5, display: 'block', lineHeight: 1.2 }}>
              Recent Form
            </Typography>
            <Typography variant="h6" fontWeight={700} sx={{ color: trendColor, lineHeight: 1.3 }}>
              {label}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {sub}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
            <Typography variant="caption" color="text.secondary" display="block">Avg (recent)</Typography>
            <Typography variant="h6" fontWeight={700} sx={{ color: trendColor }}>
              {avgRecent >= 0 ? '+' : ''}{avgRecent.toFixed(1)}
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  )
}

function ScoreTrendChart({ rounds }: { rounds: Round[] }) {
  const chartData = rounds
    .filter((r) => r.holesCompleted != null && r.holesCompleted > 0 && r.scoreToPar != null)
    .slice()
    .sort((a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime())
    .map((r, i) => ({
      index: i,
      date: new Date(r.playedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      scoreToPar: r.scoreToPar!,
      course: r.course?.name ? formatCourseName(r.course.name) : 'Unknown',
      strokes: r.totalStrokes,
    }))

  if (chartData.length < 2) return null

  const minVal = Math.min(...chartData.map((d) => d.scoreToPar))
  const maxVal = Math.max(...chartData.map((d) => d.scoreToPar))

  return (
    <Card elevation={1} sx={{ mb: 4 }}>
      <CardContent>
        <Typography variant="h6" color="primary.main" gutterBottom>
          Score Trend
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Score to par over your last {chartData.length} rounds
        </Typography>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis
              dataKey="index"
              type="number"
              domain={[0, chartData.length - 1]}
              ticks={chartData.map((d) => d.index)}
              tickFormatter={(i) => chartData[i]?.date ?? ''}
              tick={{ fontSize: 12, fill: '#888' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[minVal - 1, maxVal + 1]}
              tickFormatter={(v) => v === 0 ? 'E' : v > 0 ? `+${v}` : `${v}`}
              tick={{ fontSize: 12, fill: '#888' }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <ReferenceLine y={0} stroke="#2d5e42" strokeDasharray="4 4" strokeWidth={1.5} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload
                const score = d.scoreToPar
                const label = score === 0 ? 'E' : score > 0 ? `+${score}` : `${score}`
                return (
                  <Paper elevation={3} sx={{ p: 1.5, minWidth: 160 }}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {d.date}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, my: 0.25 }}>
                      {label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{
                      maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>
                      {d.course}
                    </Typography>
                  </Paper>
                )
              }}
            />
            <Line
              type="monotone"
              dataKey="scoreToPar"
              stroke="#1a3a5c"
              strokeWidth={2.5}
              dot={(props) => {
                const { cx, cy, payload } = props
                const score = payload.scoreToPar
                const color = score < 0 ? '#c62828' : score === 0 ? '#2d5e42' : '#1a3a5c'
                return <Dot key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={5} fill={color} stroke="#fff" strokeWidth={2} />
              }}
              activeDot={{ r: 7, strokeWidth: 2, stroke: '#fff' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

export default function StatsPage() {
  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ['stats'],
    queryFn: getStats,
  })

  const { data: handicap, isLoading: handicapLoading } = useQuery({
    queryKey: ['handicap'],
    queryFn: getHandicap,
  })

  // Reuses the ['rounds'] cache already populated by HistoryPage
  const { data: rounds } = useQuery({
    queryKey: ['rounds'],
    queryFn: getRounds,
  })

  if (statsLoading || handicapLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (statsError) {
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

  const hcapIndex = handicap?.handicapIndex
  const hcapDisplay =
    hcapIndex == null ? '–'
    : hcapIndex === 0 ? '0.0'
    : hcapIndex > 0 ? `+${hcapIndex.toFixed(1)}`
    : hcapIndex.toFixed(1)

  return (
    <Box>
    <PageHeader title="Stats" subtitle="Your performance at a glance" />
    <Container maxWidth="lg" sx={{ py: 4 }}>

      {/* Handicap Index hero */}
      <Card elevation={2} sx={{ mb: 4, background: 'linear-gradient(135deg, #1a3a2a 0%, #2d5e42 100%)' }}>
        <CardContent sx={{ py: 3 }}>
          <Grid container spacing={3} alignItems="center">
            <Grid size={{ xs: 12, sm: 'auto' }}>
              <Box sx={{ textAlign: { xs: 'center', sm: 'left' } }}>
                <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.7)', letterSpacing: 2 }}>
                  World Handicap System
                </Typography>
                <Typography variant="h1" sx={{ color: '#fff', fontWeight: 700, lineHeight: 1, fontSize: { xs: '4rem', sm: '5rem' } }}>
                  {hcapDisplay}
                </Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mt: 0.5 }}>
                  Handicap Index
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, sm: 'grow' }}>
              {handicap && hcapIndex != null ? (
                <Box sx={{ color: 'rgba(255,255,255,0.85)' }}>
                  <Typography variant="body2">
                    Based on best <strong>{handicap.differentialsUsed}</strong> of last <strong>{handicap.totalEligible}</strong> eligible rounds
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    Eligible rounds require course rating &amp; slope data
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ color: 'rgba(255,255,255,0.7)' }}>
                  <Typography variant="body2">
                    {handicap?.totalEligible ?? 0} of 3 required rounds recorded
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    Play courses from the search to get rating &amp; slope data
                  </Typography>
                </Box>
              )}
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Recent form / improvement trend */}
      <ImprovementCard rounds={rounds ?? []} />

      {/* Score differentials table */}
      {handicap && handicap.differentials.length > 0 && (
        <Card elevation={1} sx={{ mb: 4 }}>
          <CardContent>
            <Typography variant="h6" color="primary.main" gutterBottom>
              Score Differentials
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Last {handicap.totalEligible} eligible rounds · differential = (113 ÷ slope) × (score − course rating)
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'background.default' }}>
                    <TableCell>Course</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell align="center">Score</TableCell>
                    <TableCell align="center">Rating</TableCell>
                    <TableCell align="center">Slope</TableCell>
                    <TableCell align="center">Differential</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {handicap.differentials.map((d) => (
                    <TableRow
                      key={d.roundId}
                      sx={{ bgcolor: d.used ? 'rgba(45,94,66,0.08)' : undefined }}
                    >
                      <TableCell sx={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {formatCourseName(d.courseName)}
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                        {new Date(d.playedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </TableCell>
                      <TableCell align="center">{d.gross}</TableCell>
                      <TableCell align="center">{d.courseRating}</TableCell>
                      <TableCell align="center">{d.slopeRating}</TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                          <Typography variant="body2" fontWeight={d.used ? 700 : 400}>
                            {d.differential.toFixed(1)}
                          </Typography>
                          {d.used && (
                            <Chip label="used" size="small" sx={{ bgcolor: '#2d5e42', color: '#fff', height: 18, fontSize: 10 }} />
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Score trend chart */}
      <ScoreTrendChart rounds={rounds ?? []} />

      {/* General stats */}
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

      {/* Hole breakdown */}
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
    </Box>
  )
}
