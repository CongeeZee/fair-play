import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Box, Container, Typography, CircularProgress, Paper,
  Table, TableBody, TableCell, TableHead, TableRow,
  Button, Chip,
} from '@mui/material'
import GolfCourseIcon from '@mui/icons-material/GolfCourse'
import { getLiveScorecard } from '../api/live'
import { formatCourseName, timeAgo } from '../utils'
import ProfileLink from '../components/ProfileLink'
import ReactionBar from '../components/ReactionBar'
import { getReactions } from '../api/reactions'

function scoreDiffColor(diff: number | null): string {
  if (diff == null) return '#aaa'
  if (diff <= -2) return '#c9a84c'
  if (diff === -1) return '#2d5e42'
  if (diff === 0) return '#555'
  if (diff === 1) return '#e6a817'
  return '#c62828'
}

function scoreToParLabel(scoreToPar: number) {
  if (scoreToPar === 0) return 'E'
  return scoreToPar > 0 ? `+${scoreToPar}` : `${scoreToPar}`
}

export default function LiveScorecardPage() {
  const { roundId } = useParams<{ roundId: string }>()
  const navigate = useNavigate()
  const roundIdNum = parseInt(roundId || '', 10)
  const [highlightHole, setHighlightHole] = useState<number | null>(null)
  const prevHolesCompleted = useRef<number>(0)

  const { data: scorecard, isLoading } = useQuery({
    queryKey: ['live-scorecard', roundIdNum],
    queryFn: () => getLiveScorecard(roundIdNum),
    enabled: !isNaN(roundIdNum),
    refetchInterval: (query) => query.state.data?.completedAt ? false : 30000,
  })

  const { data: reactions } = useQuery({
    queryKey: ['reaction-detail', roundIdNum],
    queryFn: () => getReactions(roundIdNum),
    enabled: !isNaN(roundIdNum) && !!scorecard?.completedAt,
  })

  // Highlight newly scored hole
  useEffect(() => {
    if (!scorecard) return
    if (prevHolesCompleted.current > 0 && scorecard.holesCompleted > prevHolesCompleted.current) {
      const newHoleNum = Math.max(...scorecard.holes.filter((h) => h.strokes !== null).map((h) => h.number))
      setHighlightHole(newHoleNum)
      const timer = setTimeout(() => setHighlightHole(null), 3000)
      return () => clearTimeout(timer)
    }
    prevHolesCompleted.current = scorecard.holesCompleted
  }, [scorecard?.holesCompleted])

  if (isLoading || !scorecard) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
  }

  const isComplete = !!scorecard.completedAt
  const frontNine = scorecard.holes.slice(0, 9)
  const backNine = scorecard.holes.slice(9)

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      {/* Header */}
      <Box sx={{ textAlign: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1 }}>
          <GolfCourseIcon sx={{ color: 'primary.main' }} />
          <Typography variant="h6" sx={{ fontWeight: 800, color: 'primary.main' }}>
            Fairplay
          </Typography>
        </Box>

        <ProfileLink userId={scorecard.playerId} name={scorecard.playerName} variant="h5" sx={{ fontWeight: 700, mb: 0.5 }} />
        <Typography variant="body1" color="text.secondary">
          {formatCourseName(scorecard.courseName)}
        </Typography>

        {/* Live / Final badge */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mt: 1 }}>
          {isComplete ? (
            <Chip label="Final" sx={{ bgcolor: '#1a3a2a', color: '#fff', fontWeight: 700 }} />
          ) : (
            <Chip
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Box sx={{
                    width: 8, height: 8, borderRadius: '50%', bgcolor: '#4caf50',
                    animation: 'pulse 2s infinite',
                    '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.4 } },
                  }} />
                  Live
                </Box>
              }
              sx={{ bgcolor: 'rgba(76,175,80,0.15)', color: '#2e7d32', fontWeight: 700 }}
            />
          )}
        </Box>
      </Box>

      {/* Score summary */}
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2, mb: 3, textAlign: 'center' }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 2 }}>
          <Box>
            <Typography variant="h3" sx={{ fontWeight: 800, color: scoreDiffColor(scorecard.currentScoreToPar) }}>
              {scoreToParLabel(scorecard.currentScoreToPar)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Through {scorecard.holesCompleted} hole{scorecard.holesCompleted !== 1 ? 's' : ''}
            </Typography>
          </Box>
        </Box>
        {!isComplete && scorecard.lastScoredAt && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Last updated: {timeAgo(scorecard.lastScoredAt)}
          </Typography>
        )}
      </Paper>

      {/* Scorecard table */}
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2, mb: 3 }}>
        <HalfTable label="Front 9" holes={frontNine} highlightHole={highlightHole} />
        {backNine.length > 0 && <HalfTable label="Back 9" holes={backNine} highlightHole={highlightHole} />}
      </Paper>

      {/* Reactions when complete */}
      {isComplete && reactions && (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2, mb: 3 }}>
          <ReactionBar
            roundId={roundIdNum}
            reactionSummary={reactions.summary}
            userReaction={reactions.userReaction}
          />
          {scorecard.shareId && (
            <Button
              component={Link}
              to={`/scorecard/${scorecard.shareId}`}
              variant="outlined"
              size="small"
              sx={{ mt: 1.5, textTransform: 'none' }}
            >
              View Full Scorecard
            </Button>
          )}
        </Paper>
      )}
    </Container>
  )
}

function HalfTable({ label, holes, highlightHole }: {
  label: string
  holes: { number: number; par: number; strokes: number | null; scoreToPar: number | null }[]
  highlightHole: number | null
}) {
  const subtotalStrokes = holes.reduce((s, h) => s + (h.strokes ?? 0), 0)
  const subtotalPar = holes.filter((h) => h.strokes !== null).reduce((s, h) => s + h.par, 0)
  const hasScores = holes.some((h) => h.strokes !== null)

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'text.secondary', ml: 0.5, display: 'block', mb: 0.5 }}>
        {label}
      </Typography>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 420 }}>
          <TableHead>
            <TableRow sx={{ bgcolor: 'primary.main' }}>
              <TableCell sx={{ color: '#fff', fontWeight: 700, py: 0.75, fontSize: '0.7rem', width: 44 }}>Hole</TableCell>
              {holes.map((h) => (
                <TableCell key={h.number} align="center" sx={{ color: '#fff', fontWeight: 600, py: 0.75, fontSize: '0.7rem' }}>
                  {h.number}
                </TableCell>
              ))}
              <TableCell align="center" sx={{ color: '#c9a84c', fontWeight: 800, py: 0.75, fontSize: '0.7rem' }}>
                {label.includes('Front') ? 'Out' : 'In'}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: 'text.secondary' }}>Par</TableCell>
              {holes.map((h) => (
                <TableCell key={h.number} align="center" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{h.par}</TableCell>
              ))}
              <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'text.secondary' }}>
                {holes.reduce((s, h) => s + h.par, 0)}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Score</TableCell>
              {holes.map((h) => (
                <TableCell
                  key={h.number}
                  align="center"
                  sx={{
                    p: 0.5,
                    bgcolor: highlightHole === h.number ? 'rgba(76,175,80,0.15)' : 'transparent',
                    transition: 'background-color 1s ease',
                  }}
                >
                  {h.strokes !== null ? (
                    <Box
                      sx={{
                        width: 28, height: 28, mx: 'auto',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: (h.scoreToPar ?? 0) <= -1 ? '50%' : 1,
                        border: (h.scoreToPar ?? 0) >= 1
                          ? (h.scoreToPar ?? 0) === 1 ? '1px solid #e6a817' : '2px solid #c62828'
                          : 'none',
                        bgcolor: (h.scoreToPar ?? 0) <= -2 ? '#c9a84c' : (h.scoreToPar ?? 0) === -1 ? '#2d5e42' : 'transparent',
                        color: (h.scoreToPar ?? 0) <= -1 ? '#fff' : scoreDiffColor(h.scoreToPar),
                        fontWeight: 700, fontSize: '0.8rem',
                      }}
                    >
                      {h.strokes}
                    </Box>
                  ) : (
                    <Box sx={{ width: 28, height: 28, mx: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.disabled', fontSize: '0.78rem' }}>
                      -
                    </Box>
                  )}
                </TableCell>
              ))}
              <TableCell align="center" sx={{ fontWeight: 800, fontSize: '0.8rem' }}>
                {hasScores ? (
                  <Box component="span" sx={{ color: scoreDiffColor(subtotalStrokes - subtotalPar) }}>
                    {subtotalStrokes}
                  </Box>
                ) : '-'}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Box>
    </Box>
  )
}
