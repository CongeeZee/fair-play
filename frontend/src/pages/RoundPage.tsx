import { useState, useEffect, useRef } from 'react'
import {
  Box, Container, Typography, CircularProgress, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, TextField, Chip, Button
} from '@mui/material'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRound, scoreHole } from '../api/rounds'
import type { RoundHole } from '../types'

function scoreToPar(strokes: number, par: number) {
  return strokes - par
}

function scoreLabel(diff: number) {
  if (diff <= -2) return { label: 'Eagle', color: '#c9a84c' }
  if (diff === -1) return { label: 'Birdie', color: '#2d5e42' }
  if (diff === 0) return { label: 'Par', color: 'text.secondary' }
  if (diff === 1) return { label: 'Bogey', color: '#e6a817' }
  return { label: '+' + diff, color: '#c62828' }
}

export default function RoundPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [scores, setScores] = useState<Record<string, number>>({})
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const { data: round, isLoading, error } = useQuery({
    queryKey: ['round', id],
    queryFn: () => getRound(id!),
  })

  useEffect(() => {
    if (round?.roundHoles) {
      const initial: Record<string, number> = {}
      round.roundHoles.forEach((s: RoundHole) => {
        initial[s.holeId] = s.strokes
      })
      setScores(initial)
    }
  }, [round])

  const handleFinishRound = () => {
    queryClient.invalidateQueries({ queryKey: ['rounds'] })
    navigate('/history')
  }

  const handleScoreChange = (holeId: string, value: string) => {
    const strokes = parseInt(value, 10)

    if (isNaN(strokes) || strokes < 1) {
      setScores((prev) => { const next = { ...prev }; delete next[holeId]; return next })
      clearTimeout(debounceTimers.current[holeId])
      return
    }

    setScores((prev) => ({ ...prev, [holeId]: strokes }))

    clearTimeout(debounceTimers.current[holeId])
    debounceTimers.current[holeId] = setTimeout(() => {
      scoreHole(id!, holeId, strokes)
    }, 500)
  }

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error || !round) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">Failed to load round.</Alert>
      </Container>
    )
  }

  const holes = round.course?.holes ?? []
  const sortedHoles = [...holes].sort((a, b) => a.number - b.number)
  const totalStrokes = sortedHoles.reduce((sum, h) => sum + (scores[h.id] ?? 0), 0)
  const totalPar = sortedHoles.reduce((sum, h) => sum + h.par, 0)
  const totalDiff = totalStrokes > 0 ? totalStrokes - totalPar : null

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" color="primary.main" gutterBottom>
        {round.course?.name}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {new Date(round.playedAt).toLocaleDateString('en-GB', { dateStyle: 'long' })}
      </Typography>

      <TableContainer component={Paper} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'primary.main' }}>
              <TableCell sx={{ color: 'primary.contrastText', fontWeight: 700 }}>Hole</TableCell>
              <TableCell sx={{ color: 'primary.contrastText', fontWeight: 700 }} align="center">Par</TableCell>
              <TableCell sx={{ color: 'primary.contrastText', fontWeight: 700 }} align="center">Dist (yds)</TableCell>
              <TableCell sx={{ color: 'primary.contrastText', fontWeight: 700 }} align="center">Strokes</TableCell>
              <TableCell sx={{ color: 'primary.contrastText', fontWeight: 700 }} align="center">Score</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedHoles.map((hole, idx) => {
              const strokes = scores[hole.id]
              const diff = strokes != null ? scoreToPar(strokes, hole.par) : null
              const scoreInfo = diff != null ? scoreLabel(diff) : null

              return (
                <TableRow
                  key={hole.id}
                  sx={{ bgcolor: idx % 2 === 0 ? 'background.default' : 'background.paper' }}
                >
                  <TableCell sx={{ fontWeight: 600 }}>{hole.number}</TableCell>
                  <TableCell align="center">{hole.par}</TableCell>
                  <TableCell align="center">{hole.distance}</TableCell>
                  <TableCell align="center" sx={{ py: 0.5 }}>
                    <TextField
                      type="number"
                      size="small"
                      value={strokes ?? ''}
                      onChange={(e) => handleScoreChange(hole.id, e.target.value)}
                      inputProps={{ min: 1, max: 20, style: { textAlign: 'center', width: 60 } }}
                      sx={{ width: 80 }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    {scoreInfo && (
                      <Typography
                        variant="body2"
                        fontWeight={700}
                        sx={{ color: scoreInfo.color }}
                      >
                        {diff === 0 ? 'Par' : diff! > 0 ? `+${diff}` : diff}
                        {' '}
                        <Typography component="span" variant="caption" color="text.secondary">
                          {scoreInfo.label !== 'Par' ? scoreInfo.label : ''}
                        </Typography>
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}

            <TableRow sx={{ bgcolor: 'primary.main' }}>
              <TableCell sx={{ color: 'primary.contrastText', fontWeight: 700 }}>Total</TableCell>
              <TableCell sx={{ color: 'primary.contrastText', fontWeight: 700 }} align="center">
                {totalPar}
              </TableCell>
              <TableCell />
              <TableCell sx={{ color: 'primary.contrastText', fontWeight: 700 }} align="center">
                {totalStrokes || '–'}
              </TableCell>
              <TableCell align="center">
                {totalDiff != null && (
                  <Chip
                    label={totalDiff === 0 ? 'E' : totalDiff > 0 ? `+${totalDiff}` : totalDiff}
                    size="small"
                    sx={{
                      bgcolor: totalDiff < 0 ? '#c9a84c' : totalDiff === 0 ? '#2d5e42' : totalDiff <= 5 ? '#e6a817' : '#c62828',
                      color: '#fff',
                      fontWeight: 700,
                    }}
                  />
                )}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="contained" color="primary" size="large" onClick={handleFinishRound}>
          Finish Round
        </Button>
      </Box>
    </Container>
  )
}
