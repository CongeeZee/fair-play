import { useState, useEffect, useRef } from 'react'
import {
  Box, Container, Typography, CircularProgress, Alert,
  Paper, Button, ButtonGroup, Chip, IconButton, Divider
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew'
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRound, scoreHole } from '../api/rounds'
import type { RoundHole } from '../types'

const TEE_DIRECTIONS = [
  { value: 'fairway', label: 'Fairway' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'penalty', label: 'Penalty' },
]

function scoreLabel(diff: number) {
  if (diff <= -2) return { label: 'Eagle', color: '#c9a84c' }
  if (diff === -1) return { label: 'Birdie', color: '#2d5e42' }
  if (diff === 0) return { label: 'Par', color: '#555' }
  if (diff === 1) return { label: 'Bogey', color: '#e6a817' }
  return { label: diff === 2 ? 'Double' : `+${diff}`, color: '#c62828' }
}

interface HoleScoreState {
  strokes: number
  putts: number
  teeShotDirection: string
  sandShots: number
  penalties: number
  hazards: number
}

const defaultScore = (): HoleScoreState => ({
  strokes: 0,
  putts: 0,
  teeShotDirection: '',
  sandShots: 0,
  penalties: 0,
  hazards: 0,
})

function Stepper({
  label,
  value,
  onChange,
  min = 0,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1 }}>
      <Typography variant="body1" sx={{ fontWeight: 500, flex: 1 }}>
        {label}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <IconButton
          size="small"
          onClick={() => onChange(Math.max(min, value - 1))}
          sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
        >
          <RemoveIcon fontSize="small" />
        </IconButton>
        <Typography variant="h6" sx={{ minWidth: 28, textAlign: 'center', fontWeight: 700 }}>
          {value || '–'}
        </Typography>
        <IconButton
          size="small"
          onClick={() => onChange(value + 1)}
          sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
        >
          <AddIcon fontSize="small" />
        </IconButton>
      </Box>
    </Box>
  )
}

export default function RoundPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [currentHoleIndex, setCurrentHoleIndex] = useState(0)
  const [holeScores, setHoleScores] = useState<Record<string, HoleScoreState>>({})
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const { data: round, isLoading, error } = useQuery({
    queryKey: ['round', id],
    queryFn: () => getRound(id!),
  })

  useEffect(() => {
    if (round?.roundHoles) {
      const initial: Record<string, HoleScoreState> = {}
      round.roundHoles.forEach((s: RoundHole) => {
        initial[s.holeId] = {
          strokes: s.strokes ?? 0,
          putts: s.putts ?? 0,
          teeShotDirection: s.teeShotDirection ?? '',
          sandShots: s.sandShots ?? 0,
          penalties: s.penalties ?? 0,
          hazards: s.hazards ?? 0,
        }
      })
      setHoleScores(initial)
    }
  }, [round])

  const saveHole = (holeId: string, score: HoleScoreState) => {
    if (!score.strokes) return
    clearTimeout(debounceTimers.current[holeId])
    debounceTimers.current[holeId] = setTimeout(() => {
      scoreHole(id!, holeId, {
        strokes: score.strokes,
        putts: score.putts || undefined,
        teeShotDirection: score.teeShotDirection || undefined,
        sandShots: score.sandShots || undefined,
        penalties: score.penalties || undefined,
        hazards: score.hazards || undefined,
      })
    }, 500)
  }

  const updateField = (holeId: string, field: keyof HoleScoreState, value: number | string) => {
    setHoleScores((prev) => {
      const updated = { ...(prev[holeId] ?? defaultScore()), [field]: value }
      saveHole(holeId, updated)
      return { ...prev, [holeId]: updated }
    })
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

  const holes = [...(round.course?.holes ?? [])].sort((a, b) => a.number - b.number)
  const totalHoles = holes.length
  const hole = holes[currentHoleIndex]
  const holeId = hole?.id

  if (!hole) return null

  const score = holeScores[holeId] ?? defaultScore()
  const diff = score.strokes ? score.strokes - hole.par : null
  const scoreInfo = diff != null ? scoreLabel(diff) : null

  // Running total
  const totalStrokes = holes.reduce((sum, h) => sum + (holeScores[h.id]?.strokes ?? 0), 0)
  const totalPar = holes.reduce((sum, h) => sum + h.par, 0)
  const totalDiff = totalStrokes > 0 ? totalStrokes - totalPar : null

  const isLastHole = currentHoleIndex === totalHoles - 1

  const handleFinish = () => {
    queryClient.invalidateQueries({ queryKey: ['rounds'] })
    navigate('/history')
  }

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" color="primary.main" fontWeight={700} noWrap>
          {round.course?.name}
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            {new Date(round.playedAt).toLocaleDateString('en-GB', { dateStyle: 'long' })}
          </Typography>
          {totalDiff != null && (
            <Chip
              label={totalDiff === 0 ? 'E' : totalDiff > 0 ? `+${totalDiff}` : totalDiff}
              size="small"
              sx={{
                bgcolor:
                  totalDiff < 0 ? '#c9a84c'
                  : totalDiff === 0 ? '#2d5e42'
                  : totalDiff <= 5 ? '#e6a817'
                  : '#c62828',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.75rem',
              }}
            />
          )}
        </Box>
      </Box>

      {/* Progress */}
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
        Hole {currentHoleIndex + 1} of {totalHoles}
      </Typography>

      {/* Hole card */}
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mt: 1, overflow: 'hidden' }}>
        {/* Hole header */}
        <Box sx={{ bgcolor: 'primary.main', px: 3, py: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h3" sx={{ color: 'primary.contrastText', fontWeight: 800, lineHeight: 1 }}>
              {hole.number}
            </Typography>
            <Typography variant="caption" sx={{ color: 'primary.contrastText', opacity: 0.8 }}>
              Hole
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h5" sx={{ color: 'primary.contrastText', fontWeight: 700 }}>
              Par {hole.par}
            </Typography>
            <Typography variant="caption" sx={{ color: 'primary.contrastText', opacity: 0.8 }}>
              {hole.distance} yds
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            {scoreInfo ? (
              <>
                <Typography variant="h5" sx={{ color: scoreInfo.color === 'text.secondary' ? 'primary.contrastText' : scoreInfo.color, fontWeight: 800 }}>
                  {diff === 0 ? 'E' : diff! > 0 ? `+${diff}` : diff}
                </Typography>
                <Typography variant="caption" sx={{ color: 'primary.contrastText', opacity: 0.8 }}>
                  {scoreInfo.label}
                </Typography>
              </>
            ) : (
              <Typography variant="caption" sx={{ color: 'primary.contrastText', opacity: 0.5 }}>
                No score
              </Typography>
            )}
          </Box>
        </Box>

        <Box sx={{ px: 3, py: 2 }}>
          {/* Strokes */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5 }}>
            <Typography variant="body1" sx={{ fontWeight: 600, fontSize: '1.05rem' }}>
              Strokes
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <IconButton
                onClick={() => updateField(holeId, 'strokes', Math.max(1, score.strokes - 1))}
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
              >
                <RemoveIcon />
              </IconButton>
              <Typography variant="h5" sx={{ minWidth: 36, textAlign: 'center', fontWeight: 800 }}>
                {score.strokes || '–'}
              </Typography>
              <IconButton
                onClick={() => updateField(holeId, 'strokes', score.strokes + 1)}
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
              >
                <AddIcon />
              </IconButton>
            </Box>
          </Box>

          <Divider />

          {/* Tee shot direction */}
          <Box sx={{ py: 1.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontWeight: 500 }}>
              Tee Shot
            </Typography>
            <ButtonGroup fullWidth size="small" variant="outlined">
              {TEE_DIRECTIONS.map((dir) => (
                <Button
                  key={dir.value}
                  variant={score.teeShotDirection === dir.value ? 'contained' : 'outlined'}
                  onClick={() =>
                    updateField(holeId, 'teeShotDirection', score.teeShotDirection === dir.value ? '' : dir.value)
                  }
                  sx={{ textTransform: 'none', fontWeight: score.teeShotDirection === dir.value ? 700 : 400 }}
                >
                  {dir.label}
                </Button>
              ))}
            </ButtonGroup>
          </Box>

          <Divider />

          {/* Steppers */}
          <Stepper label="Putts" value={score.putts} onChange={(v) => updateField(holeId, 'putts', v)} />
          <Divider />
          <Stepper label="Sand Shots" value={score.sandShots} onChange={(v) => updateField(holeId, 'sandShots', v)} />
          <Divider />
          <Stepper label="Hazards" value={score.hazards} onChange={(v) => updateField(holeId, 'hazards', v)} />
          <Divider />
          <Stepper label="Penalties" value={score.penalties} onChange={(v) => updateField(holeId, 'penalties', v)} />
        </Box>
      </Paper>

      {/* Navigation */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3, gap: 2 }}>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIosNewIcon />}
          disabled={currentHoleIndex === 0}
          onClick={() => setCurrentHoleIndex((i) => i - 1)}
          sx={{ flex: 1 }}
        >
          Prev
        </Button>

        {isLastHole ? (
          <Button
            variant="contained"
            color="primary"
            onClick={handleFinish}
            sx={{ flex: 1, fontWeight: 700 }}
          >
            Finish Round
          </Button>
        ) : (
          <Button
            variant="contained"
            endIcon={<ArrowForwardIosIcon />}
            onClick={() => setCurrentHoleIndex((i) => i + 1)}
            sx={{ flex: 1 }}
          >
            Next
          </Button>
        )}
      </Box>

      {/* Hole dots progress */}
      <Box sx={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 0.5, mt: 2 }}>
        {holes.map((h, idx) => {
          const s = holeScores[h.id]
          const hasScore = s && s.strokes > 0
          const isCurrent = idx === currentHoleIndex
          return (
            <Box
              key={h.id}
              onClick={() => setCurrentHoleIndex(idx)}
              sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                cursor: 'pointer',
                bgcolor: isCurrent
                  ? 'primary.main'
                  : hasScore
                  ? 'success.main'
                  : 'divider',
                border: isCurrent ? '2px solid' : 'none',
                borderColor: 'primary.dark',
                transition: 'all 0.15s',
              }}
            />
          )
        })}
      </Box>
    </Container>
  )
}
