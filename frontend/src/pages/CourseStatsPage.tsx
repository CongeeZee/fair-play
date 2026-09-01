import {
  Box, Container, Typography, CircularProgress, Alert,
  Paper, Table, TableBody, TableCell, TableHead, TableRow,
  Chip, Card, CardContent, Grid, IconButton,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getCourseDetailStats, getRounds } from '../api/rounds'
import { getUserReviews } from '../api/reviews'
import { useAuth } from '../contexts/AuthContext'
import { formatCourseName } from '../utils'
import CourseReviewsSection from '../components/CourseReviewsSection'
import type { CourseHoleStat } from '../types'
import { CLAY, tint } from '../theme'
import { holeBand } from '../scoreColors'
import { useUnits } from '../contexts/UnitsContext'

function pct(rate: number | null) {
  if (rate == null) return '—'
  return `${(rate * 100).toFixed(0)}%`
}

function avgStr(v: number | null) {
  if (v == null) return '—'
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(2)}`
}

/**
 * Average-to-par as *text* on a light card. The previous values were the
 * mid-tone fills: gold read at 1.73:1 and the mid green at 2.98:1.
 */
function diffColor(v: number | null) {
  if (v == null) return 'text.secondary'
  return holeBand(v).text
}

function holeRating(hole: CourseHoleStat): 'strength' | 'weakness' | 'neutral' {
  if (hole.averageScoreToPar == null || hole.roundsPlayed < 2) return 'neutral'
  if (hole.averageScoreToPar <= 0) return 'strength'
  if (hole.averageScoreToPar >= 1.5) return 'weakness'
  return 'neutral'
}

export default function CourseStatsPage() {
  const { unitLabel, toDisplay } = useUnits()
  const { courseId } = useParams<{ courseId: string }>()
  const navigate = useNavigate()

  const { user } = useAuth()
  const { data, isLoading, error } = useQuery({
    queryKey: ['course-stats', courseId],
    queryFn: () => getCourseDetailStats(courseId!),
    enabled: !!courseId,
  })

  // Find user's most recent completed round at this course without a review
  const { data: myRounds } = useQuery({
    queryKey: ['rounds'],
    queryFn: getRounds,
    enabled: !!user,
  })
  const { data: myReviews } = useQuery({
    queryKey: ['user-reviews', user?.id],
    queryFn: () => getUserReviews(Number(user!.id)),
    enabled: !!user,
  })

  const promptableRound = (() => {
    if (!myRounds || !user) return null
    const reviewedRoundIds = new Set((myReviews || []).map((r) => r.roundId))
    const candidate = myRounds
      .filter((r) => String(r.courseId) === String(courseId) && (r.holesCompleted ?? 0) > 0)
      .find((r) => !reviewedRoundIds.has(Number(r.id)))
    if (!candidate) return null
    return { roundId: Number(candidate.id), courseName: candidate.course?.name || 'this course' }
  })()

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error || !data) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">Failed to load course stats.</Alert>
      </Container>
    )
  }

  const scoredHoles = data.holes.filter((h) => h.roundsPlayed > 0 && h.averageScoreToPar != null)
  const weakest = scoredHoles.length > 0
    ? [...scoredHoles].sort((a, b) => (b.averageScoreToPar ?? 0) - (a.averageScoreToPar ?? 0)).slice(0, 3)
    : []
  const strongest = scoredHoles.length > 0
    ? [...scoredHoles].sort((a, b) => (a.averageScoreToPar ?? 0) - (b.averageScoreToPar ?? 0)).slice(0, 3)
    : []

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <IconButton aria-label="Go back" onClick={() => navigate(-1)} size="small">
          <ArrowBackIcon />
        </IconButton>
        <Box>
          <Typography variant="h5" color="primary.main" fontWeight={700}>
            {formatCourseName(data.courseName)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Course breakdown
          </Typography>
        </Box>
      </Box>

      {scoredHoles.length === 0 ? (
        <Alert severity="info">No hole data recorded for this course yet. Make sure to track shot details during your rounds.</Alert>
      ) : (
        <>
          {/* Strongest / Weakest summary cards */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card elevation={2} sx={{ height: '100%', bgcolor: tint(CLAY.greenLight, 0.1) }}>
                <CardContent sx={{ pb: '12px !important' }}>
                  <Typography variant="overline" sx={{ color: CLAY.greenText, fontWeight: 700, letterSpacing: 1.5 }}>
                    Strongest Holes
                  </Typography>
                  {strongest.map((h) => (
                    <Box key={h.holeId} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                      <Typography variant="body2" fontWeight={600}>
                        Hole {h.number} <Typography component="span" variant="caption" color="text.secondary">Par {h.par}</Typography>
                      </Typography>
                      <Chip
                        label={avgStr(h.averageScoreToPar)}
                        size="small"
                        sx={{ bgcolor: CLAY.green, color: '#fff', fontWeight: 700, height: 22 }}
                      />
                    </Box>
                  ))}
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card elevation={2} sx={{ height: '100%', bgcolor: tint(CLAY.red, 0.1) }}>
                <CardContent sx={{ pb: '12px !important' }}>
                  <Typography variant="overline" sx={{ color: CLAY.errorText, fontWeight: 700, letterSpacing: 1.5 }}>
                    Weakest Holes
                  </Typography>
                  {weakest.map((h) => (
                    <Box key={h.holeId} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                      <Typography variant="body2" fontWeight={600}>
                        Hole {h.number} <Typography component="span" variant="caption" color="text.secondary">Par {h.par}</Typography>
                      </Typography>
                      <Chip
                        label={avgStr(h.averageScoreToPar)}
                        size="small"
                        sx={{ bgcolor: CLAY.redDeep, color: '#fff', fontWeight: 700, height: 22 }}
                      />
                    </Box>
                  ))}
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Full hole-by-hole table */}
          <Paper elevation={1}>
            <Box sx={{ px: 2, pt: 2, pb: 1 }}>
              <Typography variant="h6" color="primary.main" fontWeight={700}>
                Hole-by-Hole Breakdown
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Avg score to par · GIR = Green in Regulation · FIR = Fairways in Regulation (par 4/5)
              </Typography>
            </Box>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'primary.main' }}>
                    {['Hole', 'Par', unitLabel === 'm' ? 'M' : 'Yds', 'Rounds', 'Avg Score', 'Avg Putts', 'GIR', 'FIR'].map((h) => (
                      <TableCell key={h} align={h === 'Hole' ? 'left' : 'center'}
                        sx={{ color: '#fff', fontWeight: 700, fontSize: '0.72rem', py: 1 }}>
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.holes.map((hole) => {
                    const rating = holeRating(hole)
                    return (
                      <TableRow
                        key={hole.holeId}
                        sx={{
                          bgcolor:
                            rating === 'strength' ? 'rgba(74,138,104,0.06)'
                            : rating === 'weakness' ? 'rgba(176,87,76,0.05)'
                            : undefined,
                          '&:hover': { bgcolor: 'action.hover' },
                        }}
                      >
                        <TableCell sx={{ fontWeight: 700 }}>{hole.number}</TableCell>
                        <TableCell align="center" sx={{ color: 'text.secondary' }}>{hole.par}</TableCell>
                        <TableCell align="center" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>{toDisplay(hole.distance)}</TableCell>
                        <TableCell align="center" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>{hole.roundsPlayed}</TableCell>
                        <TableCell align="center">
                          {hole.averageScoreToPar != null ? (
                            <Typography variant="body2" fontWeight={700} sx={{ color: diffColor(hole.averageScoreToPar) }}>
                              {avgStr(hole.averageScoreToPar)}
                            </Typography>
                          ) : <Typography variant="body2" color="text.disabled">—</Typography>}
                        </TableCell>
                        <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                          {hole.averagePutts != null ? hole.averagePutts.toFixed(1) : '—'}
                        </TableCell>
                        <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                          {hole.girRate != null ? (
                            <Chip
                              label={pct(hole.girRate)}
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: '0.7rem',
                                bgcolor: hole.girRate >= 0.5 ? 'rgba(74,138,104,0.15)' : hole.girRate >= 0.3 ? 'rgba(217,166,63,0.15)' : 'rgba(176,87,76,0.1)',
                                color: hole.girRate >= 0.5 ? CLAY.greenText : hole.girRate >= 0.3 ? CLAY.warningText : CLAY.errorText,
                                fontWeight: 600,
                              }}
                            />
                          ) : '—'}
                        </TableCell>
                        <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                          {hole.par <= 3 ? (
                            <Typography variant="caption" color="text.disabled">N/A</Typography>
                          ) : hole.fairwayRate != null ? (
                            <Chip
                              label={pct(hole.fairwayRate)}
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: '0.7rem',
                                bgcolor: hole.fairwayRate >= 0.6 ? 'rgba(74,138,104,0.15)' : hole.fairwayRate >= 0.4 ? 'rgba(217,166,63,0.15)' : 'rgba(176,87,76,0.1)',
                                color: hole.fairwayRate >= 0.6 ? CLAY.greenText : hole.fairwayRate >= 0.4 ? CLAY.warningText : CLAY.errorText,
                                fontWeight: 600,
                              }}
                            />
                          ) : '—'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Box>
          </Paper>
        </>
      )}

      <Box sx={{ mt: 4 }}>
        <Typography variant="h6" color="primary.main" fontWeight={700} sx={{ mb: 2 }}>
          Reviews
        </Typography>
        <CourseReviewsSection courseId={courseId!} promptableRound={promptableRound} />
      </Box>
    </Container>
  )
}
