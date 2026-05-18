import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Box, Container, Typography, CircularProgress, Paper,
  Table, TableBody, TableCell, TableHead, TableRow,
  Button, Chip, Alert,
} from '@mui/material'
import GolfCourseIcon from '@mui/icons-material/GolfCourse'
import { getSharedScorecard } from '../api/rounds'
import { formatCourseName } from '../utils'
import type { SharedScorecard } from '../types'

function scoreDiffColor(diff: number | null): string {
  if (diff == null) return '#aaa'
  if (diff <= -2) return '#c9a84c'
  if (diff === -1) return '#2d5e42'
  if (diff === 0) return '#555'
  if (diff === 1) return '#e6a817'
  return '#c62828'
}

function ScoreCell({ strokes, par }: { strokes: number | null; par: number }) {
  if (strokes == null) return <TableCell align="center" sx={{ color: 'text.disabled', fontSize: '0.78rem' }}>–</TableCell>
  const diff = strokes - par
  const isCircle = diff <= -1
  const isBorder = diff >= 1
  return (
    <TableCell align="center" sx={{ p: 0.5 }}>
      <Box
        sx={{
          width: 28, height: 28, mx: 'auto',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: isCircle ? '50%' : 1,
          border: isBorder
            ? diff === 1 ? '1px solid #e6a817' : '2px solid #c62828'
            : 'none',
          bgcolor: diff <= -2 ? '#c9a84c' : diff === -1 ? '#2d5e42' : 'transparent',
          color: diff <= -1 ? '#fff' : scoreDiffColor(diff),
          fontWeight: 700, fontSize: '0.8rem',
        }}
      >
        {strokes}
      </Box>
    </TableCell>
  )
}

function HalfTable({
  label,
  holes,
  subtotalStrokes,
  subtotalPar,
}: {
  label: string
  holes: SharedScorecard['holes']
  subtotalStrokes: number
  subtotalPar: number
}) {
  const subtotalDiff = subtotalStrokes > 0 ? subtotalStrokes - subtotalPar : null
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
                <ScoreCell key={h.number} strokes={h.strokes} par={h.par} />
              ))}
              <TableCell align="center" sx={{ fontWeight: 800, fontSize: '0.8rem' }}>
                {subtotalDiff != null ? (
                  <Box component="span" sx={{ color: scoreDiffColor(subtotalDiff) }}>
                    {subtotalStrokes}
                  </Box>
                ) : '–'}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Box>
    </Box>
  )
}

export default function SharedScorecardPage() {
  const { shareId } = useParams<{ shareId: string }>()
  const navigate = useNavigate()

  const { data: scorecard, isLoading, error } = useQuery({
    queryKey: ['shared-scorecard', shareId],
    queryFn: () => getSharedScorecard(shareId!),
    enabled: !!shareId,
  })

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error || !scorecard) {
    return (
      <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 2, color: 'primary.main' }}>
          Scorecard not found
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          This scorecard may have been deleted or the link is invalid.
        </Typography>
        <Button variant="contained" onClick={() => navigate('/')}>
          Go to Fairplay
        </Button>
      </Container>
    )
  }

  const frontNine = scorecard.holes.slice(0, 9)
  const backNine = scorecard.holes.slice(9)
  const { total } = scorecard
  const scoreToParStr = total.scoreToPar === 0 ? 'E' : total.scoreToPar > 0 ? `+${total.scoreToPar}` : `${total.scoreToPar}`

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ textAlign: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1 }}>
          <GolfCourseIcon sx={{ color: 'primary.main' }} />
          <Typography variant="h6" sx={{ fontWeight: 800, color: 'primary.main' }}>
            Fairplay
          </Typography>
        </Box>

        <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
          {scorecard.playerName}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 0.5 }}>
          {formatCourseName(scorecard.courseName)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {new Date(scorecard.playedAt).toLocaleDateString('en-GB', { dateStyle: 'long' })}
        </Typography>

        {scorecard.inProgress && (
          <Alert severity="info" sx={{ mt: 2, justifyContent: 'center' }}>
            Round in progress — {scorecard.holesScored} of {scorecard.totalHoles} holes scored
          </Alert>
        )}
      </Box>

      {/* Score summary */}
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2, mb: 3, textAlign: 'center' }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 2 }}>
          <Box>
            <Typography variant="h3" sx={{ fontWeight: 800, color: 'primary.main' }}>
              {total.strokes || '–'}
            </Typography>
            <Typography variant="caption" color="text.secondary">Total</Typography>
          </Box>
          {total.strokes > 0 && (
            <Chip
              label={scoreToParStr}
              sx={{
                bgcolor: scoreDiffColor(total.scoreToPar),
                color: '#fff',
                fontWeight: 800,
                fontSize: '1rem',
                height: 36,
              }}
            />
          )}
        </Box>
      </Paper>

      {/* Scorecard tables */}
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2, mb: 3 }}>
        <HalfTable
          label="Front 9"
          holes={frontNine}
          subtotalStrokes={scorecard.frontNine.strokes}
          subtotalPar={scorecard.frontNine.par}
        />
        {backNine.length > 0 && scorecard.backNine && (
          <HalfTable
            label="Back 9"
            holes={backNine}
            subtotalStrokes={scorecard.backNine.strokes}
            subtotalPar={scorecard.backNine.par}
          />
        )}

        {/* Total row */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 3, mt: 1, px: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Par: <strong>{total.par}</strong>
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Score: <strong>{total.strokes || '–'}</strong>
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700, color: scoreDiffColor(total.scoreToPar) }}>
            {scoreToParStr}
          </Typography>
        </Box>
      </Paper>

      {/* CTA */}
      <Box sx={{ textAlign: 'center' }}>
        <Button
          variant="contained"
          size="large"
          onClick={() => navigate('/register')}
          sx={{ fontWeight: 700, px: 4 }}
        >
          Track your own rounds
        </Button>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Free golf scoring, handicap tracking, and game insights
        </Typography>
      </Box>
    </Container>
  )
}
