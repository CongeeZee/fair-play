import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Box, Container, Typography, CircularProgress, Alert,
  Paper, Button, ButtonGroup, Chip, IconButton, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Table, TableBody, TableCell, TableHead, TableRow,
  Tooltip, Fade,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew'
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos'
import TableChartIcon from '@mui/icons-material/TableChart'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import SyncIcon from '@mui/icons-material/Sync'
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

const STROKE_QUICK_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

function scoreLabel(diff: number) {
  if (diff <= -2) return { label: 'Eagle', color: '#c9a84c' }
  if (diff === -1) return { label: 'Birdie', color: '#2d5e42' }
  if (diff === 0) return { label: 'Par', color: '#555' }
  if (diff === 1) return { label: 'Bogey', color: '#e6a817' }
  return { label: diff === 2 ? 'Double' : `+${diff}`, color: '#c62828' }
}

function scoreDiffColor(diff: number | null): string {
  if (diff == null) return '#aaa'
  if (diff < 0) return '#c9a84c'
  if (diff === 0) return '#2d5e42'
  if (diff <= 3) return '#1a3a5c'
  return '#c62828'
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

// ── Scorecard Dialog ──────────────────────────────────────────────────────────
interface ScorecardDialogProps {
  open: boolean
  onClose: () => void
  holes: { id: string; number: number; par: number; distance: number }[]
  holeScores: Record<string, HoleScoreState>
  currentHoleIndex: number
  onSelectHole: (idx: number) => void
}

function ScorecardDialog({ open, onClose, holes, holeScores, currentHoleIndex, onSelectHole }: ScorecardDialogProps) {
  const frontNine = holes.slice(0, 9)
  const backNine = holes.slice(9)

  const totalPar = holes.reduce((s, h) => s + h.par, 0)
  const totalStrokes = holes.reduce((s, h) => s + (holeScores[h.id]?.strokes ?? 0), 0)
  const frontPar = frontNine.reduce((s, h) => s + h.par, 0)
  const frontStrokes = frontNine.reduce((s, h) => s + (holeScores[h.id]?.strokes ?? 0), 0)
  const backPar = backNine.reduce((s, h) => s + h.par, 0)
  const backStrokes = backNine.reduce((s, h) => s + (holeScores[h.id]?.strokes ?? 0), 0)

  const renderHalfTable = (
    half: { id: string; number: number; par: number; distance: number }[],
    label: string,
    subPar: number,
    subStrokes: number
  ) => (
    <Box sx={{ mb: 2 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, ml: 0.5, display: 'block', mb: 0.5 }}>
        {label}
      </Typography>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 460 }}>
          <TableHead>
            <TableRow sx={{ bgcolor: 'primary.main' }}>
              <TableCell sx={{ color: '#fff', fontWeight: 700, py: 0.75, fontSize: '0.7rem', width: 40 }}>Hole</TableCell>
              {half.map((h) => (
                <TableCell
                  key={h.id}
                  align="center"
                  sx={{
                    color: h.number - 1 === currentHoleIndex ? '#c9a84c' : '#fff',
                    fontWeight: h.number - 1 === currentHoleIndex ? 800 : 600,
                    py: 0.75,
                    fontSize: '0.7rem',
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                  }}
                  onClick={() => { onSelectHole(h.number - 1); onClose() }}
                >
                  {h.number}
                </TableCell>
              ))}
              <TableCell align="center" sx={{ color: '#c9a84c', fontWeight: 800, py: 0.75, fontSize: '0.7rem' }}>
                {label === 'Front 9' ? 'Out' : 'In'}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: 'text.secondary' }}>Par</TableCell>
              {half.map((h) => (
                <TableCell key={h.id} align="center" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                  {h.par}
                </TableCell>
              ))}
              <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'text.secondary' }}>
                {subPar}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Score</TableCell>
              {half.map((h) => {
                const s = holeScores[h.id]?.strokes ?? 0
                const diff = s ? s - h.par : null
                const isCurrent = h.number - 1 === currentHoleIndex
                return (
                  <TableCell
                    key={h.id}
                    align="center"
                    onClick={() => { onSelectHole(h.number - 1); onClose() }}
                    sx={{ cursor: 'pointer', p: 0.5 }}
                  >
                    <Box
                      sx={{
                        width: 26, height: 26, mx: 'auto',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: diff != null && diff <= -1 ? '50%' : 1,
                        border: isCurrent ? '2px solid #c9a84c'
                          : diff === 1 ? '1px solid #e6a817'
                          : diff != null && diff >= 2 ? '2px solid #c62828'
                          : 'none',
                        bgcolor:
                          diff == null ? 'transparent'
                          : diff <= -2 ? '#c9a84c'
                          : diff === -1 ? '#2d5e42'
                          : 'transparent',
                        color:
                          diff == null ? 'text.disabled'
                          : diff <= -1 ? '#fff'
                          : diff === 0 ? 'text.primary'
                          : diff === 1 ? '#e6a817'
                          : '#c62828',
                        fontWeight: s ? 700 : 400,
                        fontSize: '0.78rem',
                      }}
                    >
                      {s || '–'}
                    </Box>
                  </TableCell>
                )
              })}
              <TableCell align="center" sx={{ fontWeight: 800, fontSize: '0.8rem' }}>
                {subStrokes > 0 ? subStrokes : '–'}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Box>
    </Box>
  )

  const totalDiff = totalStrokes > 0 ? totalStrokes - totalPar : null

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" fontWeight={700}>Scorecard</Typography>
        {totalDiff != null && (
          <Chip
            label={totalDiff === 0 ? 'E' : totalDiff > 0 ? `+${totalDiff}` : totalDiff}
            sx={{ bgcolor: scoreDiffColor(totalDiff), color: '#fff', fontWeight: 800, fontSize: '0.9rem' }}
          />
        )}
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {renderHalfTable(frontNine, 'Front 9', frontPar, frontStrokes)}
        {backNine.length > 0 && renderHalfTable(backNine, 'Back 9', backPar, backStrokes)}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1, gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Total Par: <strong>{totalPar}</strong>
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Total: <strong>{totalStrokes > 0 ? totalStrokes : '–'}</strong>
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type SaveStatus = 'idle' | 'saving' | 'saved'

export default function RoundPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [currentHoleIndex, setCurrentHoleIndex] = useState(0)
  const [holeScores, setHoleScores] = useState<Record<string, HoleScoreState>>({})
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [scorecardOpen, setScorecardOpen] = useState(false)
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const saveHole = useCallback((holeId: string, score: HoleScoreState) => {
    if (!score.strokes) return
    setSaveStatus('saving')
    clearTimeout(debounceTimers.current[holeId])
    debounceTimers.current[holeId] = setTimeout(async () => {
      try {
        await scoreHole(id!, holeId, {
          strokes: score.strokes,
          putts: score.putts || undefined,
          teeShotDirection: score.teeShotDirection || undefined,
          sandShots: score.sandShots || undefined,
          penalties: score.penalties || undefined,
          hazards: score.hazards || undefined,
        })
        setSaveStatus('saved')
        if (savedTimer.current) clearTimeout(savedTimer.current)
        savedTimer.current = setTimeout(() => setSaveStatus('idle'), 2500)
      } catch {
        setSaveStatus('idle')
      }
    }, 500)
  }, [id])

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
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
          <Typography variant="h6" color="primary.main" fontWeight={700} sx={{ flex: 1 }}>
            {round.course?.name}
          </Typography>
          <Tooltip title="View scorecard">
            <Button
              size="small"
              variant="outlined"
              startIcon={<TableChartIcon fontSize="small" />}
              onClick={() => setScorecardOpen(true)}
              sx={{ flexShrink: 0, fontSize: '0.75rem', py: 0.5 }}
            >
              Scorecard
            </Button>
          </Tooltip>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            {new Date(round.playedAt).toLocaleDateString('en-GB', { dateStyle: 'long' })}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Fade in={saveStatus !== 'idle'}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {saveStatus === 'saving' && (
                  <>
                    <SyncIcon sx={{
                      fontSize: 14,
                      color: 'text.secondary',
                      animation: 'spin 1s linear infinite',
                      '@keyframes spin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
                    }} />
                    <Typography variant="caption" color="text.secondary">Saving…</Typography>
                  </>
                )}
                {saveStatus === 'saved' && (
                  <>
                    <CheckCircleIcon sx={{ fontSize: 14, color: '#2d5e42' }} />
                    <Typography variant="caption" sx={{ color: '#2d5e42' }}>Saved</Typography>
                  </>
                )}
              </Box>
            </Fade>
            {totalDiff != null && (
              <Chip
                label={totalDiff === 0 ? 'E' : totalDiff > 0 ? `+${totalDiff}` : totalDiff}
                size="small"
                sx={{ bgcolor: scoreDiffColor(totalDiff), color: '#fff', fontWeight: 700, fontSize: '0.75rem' }}
              />
            )}
          </Box>
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
          {/* Strokes — stepper + quick-tap chips */}
          <Box sx={{ py: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
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
            {/* Quick-tap number grid */}
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              {STROKE_QUICK_VALUES.map((n) => {
                const isSelected = score.strokes === n
                const nDiff = n - hole.par
                const chipBg = isSelected
                  ? nDiff <= -2 ? '#c9a84c'
                    : nDiff === -1 ? '#2d5e42'
                    : nDiff === 0 ? '#4a5e4a'
                    : nDiff === 1 ? '#e6a817'
                    : '#c62828'
                  : undefined
                return (
                  <Box
                    key={n}
                    onClick={() => updateField(holeId, 'strokes', n)}
                    sx={{
                      width: 36, height: 36,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 1, cursor: 'pointer',
                      border: '1px solid',
                      borderColor: isSelected ? 'transparent' : 'divider',
                      bgcolor: isSelected ? chipBg : 'background.paper',
                      color: isSelected ? '#fff' : 'text.primary',
                      fontWeight: isSelected ? 800 : 500,
                      fontSize: '0.875rem',
                      transition: 'all 0.12s ease',
                      '&:hover': { bgcolor: isSelected ? chipBg : 'action.hover', transform: 'scale(1.08)' },
                      userSelect: 'none',
                    }}
                  >
                    {n}
                  </Box>
                )
              })}
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

      {/* Hole dots — now colored by score, with tooltips */}
      <Box sx={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 0.5, mt: 2 }}>
        {holes.map((h, idx) => {
          const s = holeScores[h.id]
          const hasScore = s && s.strokes > 0
          const isCurrent = idx === currentHoleIndex
          const holeDiff = hasScore ? s.strokes - h.par : null
          const dotColor = isCurrent
            ? 'primary.main'
            : !hasScore ? 'divider'
            : holeDiff! < 0 ? '#c9a84c'
            : holeDiff === 0 ? '#2d5e42'
            : holeDiff! <= 2 ? '#e6a817'
            : '#c62828'
          return (
            <Tooltip key={h.id} title={`Hole ${h.number}${hasScore ? ` — ${s.strokes} strokes` : ''}`} arrow>
              <Box
                onClick={() => setCurrentHoleIndex(idx)}
                sx={{
                  width: 12, height: 12,
                  borderRadius: '50%',
                  cursor: 'pointer',
                  bgcolor: dotColor,
                  border: isCurrent ? '2px solid' : 'none',
                  borderColor: 'primary.dark',
                  transition: 'all 0.15s',
                  '&:hover': { transform: 'scale(1.35)' },
                }}
              />
            </Tooltip>
          )
        })}
      </Box>

      <ScorecardDialog
        open={scorecardOpen}
        onClose={() => setScorecardOpen(false)}
        holes={holes}
        holeScores={holeScores}
        currentHoleIndex={currentHoleIndex}
        onSelectHole={(idx) => setCurrentHoleIndex(idx)}
      />
    </Container>
  )
}
