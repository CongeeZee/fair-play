import {
  Box, Container, Typography, CircularProgress, Alert,
  Grid, Card, CardContent, Divider, LinearProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip,
  List, ListItemButton, ListItemText, Button,
} from '@mui/material'
import BarChartIcon from '@mui/icons-material/BarChart'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import TrendingDownIcon from '@mui/icons-material/TrendingDown'
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat'
import LightbulbIcon from '@mui/icons-material/Lightbulb'
import GolfCourseIcon from '@mui/icons-material/GolfCourse'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getStats, getHandicap, getRounds, getCourseStats, getInsights, getLinkedHandicap, unlinkHandicap, refreshLinkedHandicap } from '../api/rounds'
import { formatCourseName } from '../utils'
import PageHeader from '../components/PageHeader'
import LinkHandicapDialog from '../components/LinkHandicapDialog'
import HandicapTrendChart from '../components/HandicapTrendChart'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Dot
} from 'recharts'
import { useState } from 'react'
import LinkIcon from '@mui/icons-material/Link'
import LinkOffIcon from '@mui/icons-material/LinkOff'
import RefreshIcon from '@mui/icons-material/Refresh'
import type { Round, InsightSuggestion } from '../types'

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

function severityIcon(s: InsightSuggestion['severity']) {
  if (s === 'high') return <WarningAmberIcon sx={{ fontSize: 18, color: '#c62828' }} />
  if (s === 'medium') return <InfoOutlinedIcon sx={{ fontSize: 18, color: '#e6a817' }} />
  return <CheckCircleOutlineIcon sx={{ fontSize: 18, color: '#2d5e42' }} />
}

function severityBg(s: InsightSuggestion['severity']) {
  if (s === 'high') return { bg: 'rgba(198,40,40,0.06)', border: 'rgba(198,40,40,0.2)', text: '#c62828' }
  if (s === 'medium') return { bg: 'rgba(230,168,23,0.06)', border: 'rgba(230,168,23,0.25)', text: '#8a6000' }
  return { bg: 'rgba(45,94,66,0.06)', border: 'rgba(45,94,66,0.2)', text: '#2d5e42' }
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ textAlign: 'center', px: 1.5, py: 1, bgcolor: 'background.default', borderRadius: 2, flex: 1, minWidth: 80 }}>
      <Typography variant="h6" fontWeight={700} color="primary.main">{value}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2, display: 'block' }}>{label}</Typography>
    </Box>
  )
}

export default function StatsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ['stats'],
    queryFn: getStats,
  })

  const { data: handicap, isLoading: handicapLoading } = useQuery({
    queryKey: ['handicap'],
    queryFn: getHandicap,
  })

  const { data: linkedHandicap } = useQuery({
    queryKey: ['linked-handicap'],
    queryFn: getLinkedHandicap,
  })

  const handleUnlink = async () => {
    await unlinkHandicap()
    queryClient.invalidateQueries({ queryKey: ['linked-handicap'] })
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshLinkedHandicap()
      queryClient.invalidateQueries({ queryKey: ['linked-handicap'] })
    } finally {
      setRefreshing(false)
    }
  }

  // Reuses the ['rounds'] cache already populated by HistoryPage
  const { data: rounds } = useQuery({
    queryKey: ['rounds'],
    queryFn: getRounds,
  })

  const { data: courseStats } = useQuery({
    queryKey: ['course-stats'],
    queryFn: getCourseStats,
  })

  const { data: insights } = useQuery({
    queryKey: ['insights'],
    queryFn: getInsights,
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

  // Use linked handicap if available, otherwise use calculated
  const hasLinked = linkedHandicap != null
  const displayIndex = hasLinked ? linkedHandicap.handicapIndex : handicap?.handicapIndex
  const hcapDisplay =
    displayIndex == null ? '–'
    : displayIndex === 0 ? '0.0'
    : displayIndex > 0 ? `+${displayIndex.toFixed(1)}`
    : displayIndex.toFixed(1)

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
                  {hasLinked ? 'Official Handicap' : 'World Handicap System'}
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
              {hasLinked ? (
                <Box sx={{ color: 'rgba(255,255,255,0.85)' }}>
                  <Chip
                    label={linkedHandicap.source === 'golf_australia' ? 'Golf Australia' : linkedHandicap.source === 'ghin' ? 'GHIN / USGA' : 'Manual'}
                    size="small"
                    sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 600, mb: 0.5 }}
                  />
                  {linkedHandicap.playerName && (
                    <Typography variant="body2">{linkedHandicap.playerName}</Typography>
                  )}
                  {linkedHandicap.clubName && (
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block' }}>
                      {linkedHandicap.clubName}
                    </Typography>
                  )}
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block', mt: 0.5 }}>
                    Last synced: {new Date(linkedHandicap.lastSynced).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
                  </Typography>
                  <Box sx={{ mt: 1.5, display: 'flex', gap: 1 }}>
                    {linkedHandicap.source !== 'manual' && (
                      <Button
                        size="small"
                        startIcon={refreshing ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon />}
                        onClick={handleRefresh}
                        disabled={refreshing}
                        sx={{ color: 'rgba(255,255,255,0.8)', borderColor: 'rgba(255,255,255,0.3)', fontSize: '0.7rem' }}
                        variant="outlined"
                      >
                        Refresh
                      </Button>
                    )}
                    <Button
                      size="small"
                      startIcon={<LinkOffIcon />}
                      onClick={handleUnlink}
                      sx={{ color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.2)', fontSize: '0.7rem' }}
                      variant="outlined"
                    >
                      Unlink
                    </Button>
                  </Box>
                </Box>
              ) : handicap && handicap.handicapIndex != null ? (
                <Box sx={{ color: 'rgba(255,255,255,0.85)' }}>
                  <Typography variant="body2">
                    Based on best <strong>{handicap.differentialsUsed}</strong> of last <strong>{handicap.totalEligible}</strong> eligible rounds
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    Eligible rounds require course rating &amp; slope data
                  </Typography>
                  <Box sx={{ mt: 1.5 }}>
                    <Button
                      size="small"
                      startIcon={<LinkIcon />}
                      onClick={() => setLinkDialogOpen(true)}
                      sx={{ color: 'rgba(255,255,255,0.8)', borderColor: 'rgba(255,255,255,0.3)', fontSize: '0.7rem' }}
                      variant="outlined"
                    >
                      Link official handicap
                    </Button>
                  </Box>
                </Box>
              ) : (
                <Box sx={{ color: 'rgba(255,255,255,0.7)' }}>
                  <Typography variant="body2">
                    {handicap?.totalEligible ?? 0} of 3 required rounds recorded
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    Play courses from the search to get rating &amp; slope data
                  </Typography>
                  <Box sx={{ mt: 1.5 }}>
                    <Button
                      size="small"
                      startIcon={<LinkIcon />}
                      onClick={() => setLinkDialogOpen(true)}
                      sx={{ color: 'rgba(255,255,255,0.8)', borderColor: 'rgba(255,255,255,0.3)', fontSize: '0.7rem' }}
                      variant="outlined"
                    >
                      Link official handicap
                    </Button>
                  </Box>
                </Box>
              )}
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <LinkHandicapDialog
        open={linkDialogOpen}
        onClose={() => setLinkDialogOpen(false)}
        onLinked={() => queryClient.invalidateQueries({ queryKey: ['linked-handicap'] })}
      />

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

      {/* Handicap trend chart */}
      <HandicapTrendChart />

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
        <Card elevation={1} sx={{ mb: 4 }}>
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

      {/* ── Game Insights ─────────────────────────────────────────────── */}
      {insights?.hasData && insights.suggestions && insights.suggestions.length > 0 && (
        <Card elevation={1} sx={{ mb: 4 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <LightbulbIcon sx={{ color: '#c9a84c' }} />
              <Typography variant="h6" color="primary.main" fontWeight={700}>
                Game Insights
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Based on {insights.dataPoints} holes analysed
            </Typography>

            {/* Key metrics row */}
            {insights.metrics && (
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2.5 }}>
                {insights.metrics.girRate != null && (
                  <MetricPill label="GIR Rate" value={`${(insights.metrics.girRate * 100).toFixed(0)}%`} />
                )}
                {insights.metrics.fairwayRate != null && (
                  <MetricPill label="Fairways Hit" value={`${(insights.metrics.fairwayRate * 100).toFixed(0)}%`} />
                )}
                {insights.metrics.avgPutts != null && (
                  <MetricPill label="Avg Putts" value={insights.metrics.avgPutts.toFixed(1)} />
                )}
                {insights.metrics.doublePlusRate != null && (
                  <MetricPill label="Double+ Rate" value={`${(insights.metrics.doublePlusRate * 100).toFixed(0)}%`} />
                )}
              </Box>
            )}

            <Divider sx={{ mb: 2 }} />

            {/* Per-par averages */}
            {insights.metrics && (insights.metrics.par3 || insights.metrics.par4 || insights.metrics.par5) && (
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2.5 }}>
                {insights.metrics.par3 && (
                  <MetricPill
                    label={`Par 3 avg (${insights.metrics.par3.count} holes)`}
                    value={insights.metrics.par3.averageScoreToPar > 0 ? `+${insights.metrics.par3.averageScoreToPar.toFixed(1)}` : insights.metrics.par3.averageScoreToPar.toFixed(1)}
                  />
                )}
                {insights.metrics.par4 && (
                  <MetricPill
                    label={`Par 4 avg (${insights.metrics.par4.count} holes)`}
                    value={insights.metrics.par4.averageScoreToPar > 0 ? `+${insights.metrics.par4.averageScoreToPar.toFixed(1)}` : insights.metrics.par4.averageScoreToPar.toFixed(1)}
                  />
                )}
                {insights.metrics.par5 && (
                  <MetricPill
                    label={`Par 5 avg (${insights.metrics.par5.count} holes)`}
                    value={insights.metrics.par5.averageScoreToPar > 0 ? `+${insights.metrics.par5.averageScoreToPar.toFixed(1)}` : insights.metrics.par5.averageScoreToPar.toFixed(1)}
                  />
                )}
              </Box>
            )}

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {insights.suggestions.map((s, i) => {
                const { bg, border, text } = severityBg(s.severity)
                return (
                  <Box key={i} sx={{ display: 'flex', gap: 1.5, p: 1.5, bgcolor: bg, border: '1px solid', borderColor: border, borderRadius: 2 }}>
                    <Box sx={{ pt: 0.1, flexShrink: 0 }}>{severityIcon(s.severity)}</Box>
                    <Box>
                      <Typography variant="caption" fontWeight={700} sx={{ color: text, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                        {s.area}
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.25 }}>
                        {s.message}
                      </Typography>
                    </Box>
                  </Box>
                )
              })}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* ── Courses Played ────────────────────────────────────────────── */}
      {courseStats && courseStats.length > 0 && (
        <Card elevation={1} sx={{ mb: 4 }}>
          <CardContent sx={{ pb: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <GolfCourseIcon sx={{ color: 'primary.main' }} />
              <Typography variant="h6" color="primary.main" fontWeight={700}>
                Courses Played
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Click a course to see your hole-by-hole breakdown
            </Typography>
          </CardContent>
          <List disablePadding>
            {courseStats.map((c, idx) => {
              const diffStr = c.averageScoreToPar === 0 ? 'E' : c.averageScoreToPar > 0 ? `+${c.averageScoreToPar.toFixed(1)}` : c.averageScoreToPar.toFixed(1)
              const bestStr = c.bestScoreToPar === 0 ? 'E' : c.bestScoreToPar > 0 ? `+${c.bestScoreToPar}` : `${c.bestScoreToPar}`
              const chipColor = c.averageScoreToPar < 0 ? '#c9a84c' : c.averageScoreToPar === 0 ? '#2d5e42' : c.averageScoreToPar <= 10 ? '#1a3a5c' : '#c62828'
              return (
                <Box key={c.courseId}>
                  {idx > 0 && <Divider />}
                  <ListItemButton onClick={() => navigate(`/stats/courses/${c.courseId}`)}>
                    <ListItemText
                      primary={formatCourseName(c.courseName)}
                      secondary={`${c.roundsPlayed} round${c.roundsPlayed !== 1 ? 's' : ''} · Best: ${bestStr}`}
                    />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="caption" color="text.secondary" display="block">Avg</Typography>
                        <Chip label={diffStr} size="small" sx={{ bgcolor: chipColor, color: '#fff', fontWeight: 700, height: 22 }} />
                      </Box>
                      <ChevronRightIcon sx={{ color: 'text.secondary' }} />
                    </Box>
                  </ListItemButton>
                </Box>
              )
            })}
          </List>
        </Card>
      )}
    </Container>
    </Box>
  )
}
