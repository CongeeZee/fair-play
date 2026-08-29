import { useState } from 'react'
import {
  Box, Typography, Card, CardContent, CardActionArea, Chip, Button,
  CircularProgress, Fab, Collapse, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, List, ListItem, ListItemText, Checkbox, ListItemButton,
  ToggleButton, ToggleButtonGroup, Stepper as MuiStepper, Step, StepLabel,
  Switch, FormControlLabel, Divider,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import CalendarTodayIcon from '@mui/icons-material/CalendarToday'
import GolfCourseIcon from '@mui/icons-material/GolfCourse'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import DeleteIcon from '@mui/icons-material/Delete'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import {
  getCompetitions, getCompetition, createCompetition,
  inviteToCompetition, respondToCompetition, submitRound,
  getEligibleRounds, deleteCompetition,
} from '../api/competitions'
import { getFriends } from '../api/friends'
import { formatCourseName } from '../utils'
import { useAuth } from '../contexts/AuthContext'
import PageHeader from '../components/PageHeader'
import ProfileLink from '../components/ProfileLink'
import CourseSearchInput from '../components/CourseSearchInput'
import type { CompetitionSummary } from '../types'
import { capture, AnalyticsEvent } from '../analytics'
import EmptyState from '../components/EmptyState'

// ── Status badge colors ──────────────────────────────────────────────────────

function statusColor(status: string) {
  if (status === 'ACTIVE') return { bg: '#4a8a68', text: '#fff' }
  if (status === 'UPCOMING') return { bg: '#5c86a8', text: '#fff' }
  return { bg: '#666', text: '#fff' }
}

function formatDateRange(start: string, end: string) {
  const s = new Date(start)
  const e = new Date(end)
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  if (s.getFullYear() !== e.getFullYear()) {
    return `${s.toLocaleDateString('en-GB', { ...opts, year: 'numeric' })} – ${e.toLocaleDateString('en-GB', { ...opts, year: 'numeric' })}`
  }
  return `${s.toLocaleDateString('en-GB', opts)} – ${e.toLocaleDateString('en-GB', opts)}`
}

function scoreLabel(v: number) {
  if (v === 0) return 'E'
  return v > 0 ? `+${v}` : `${v}`
}

// ── Competition Card ─────────────────────────────────────────────────────────

function CompCard({ comp, onClick }: { comp: CompetitionSummary; onClick: () => void }) {
  const sc = statusColor(comp.status)
  return (
    <Card elevation={1} sx={{ mb: 1.5, borderRadius: 2 }}>
      <CardActionArea onClick={onClick} sx={{ p: 0 }}>
        <CardContent sx={{ py: 2, px: 2.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }} noWrap>
                {comp.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {comp.course ? formatCourseName(comp.course.name) : 'Any Course'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                {formatDateRange(comp.startDate, comp.endDate)} · {comp.participantCount} player{comp.participantCount !== 1 ? 's' : ''}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5, ml: 1 }}>
              <Chip label={comp.status} size="small" sx={{ bgcolor: sc.bg, color: sc.text, fontWeight: 700, fontSize: '0.65rem', height: 22 }} />
              <Chip label={comp.scoringType} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
            </Box>
          </Box>
          {comp.myStatus === 'INVITED' && (
            <Chip label="Invitation pending" size="small" color="warning" sx={{ mt: 1, fontWeight: 600 }} />
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  )
}

// ── Collapsible Section ──────────────────────────────────────────────────────

function Section({ title, comps, onSelect, defaultOpen = true }: {
  title: string; comps: CompetitionSummary[]; onSelect: (id: string) => void; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (comps.length === 0) return null
  return (
    <Box sx={{ mb: 2 }}>
      <Box
        onClick={() => setOpen(!open)}
        sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', mb: 1 }}
      >
        <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: 1.5, color: 'text.secondary', flex: 1 }}>
          {title} ({comps.length})
        </Typography>
        {open ? <ExpandLessIcon fontSize="small" color="action" /> : <ExpandMoreIcon fontSize="small" color="action" />}
      </Box>
      <Collapse in={open}>
        {comps.map((c) => <CompCard key={c.id} comp={c} onClick={() => onSelect(c.id)} />)}
      </Collapse>
    </Box>
  )
}

// ── Create Competition Dialog ────────────────────────────────────────────────

function CreateCompDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [anyCourse, setAnyCourse] = useState(true)
  const [selectedCourse, setSelectedCourse] = useState<{ id: string; name: string } | null>(null)
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10)
  })
  const [scoringType, setScoringType] = useState<'NET' | 'GROSS' | 'STABLEFORD'>('NET')
  const [selectedFriends, setSelectedFriends] = useState<number[]>([])
  const [error, setError] = useState('')

  const { data: friends } = useQuery({
    queryKey: ['friends'],
    queryFn: getFriends,
  })

  const createMutation = useMutation({
    mutationFn: () => createCompetition({
      name,
      courseId: !anyCourse && selectedCourse ? parseInt(selectedCourse.id) : undefined,
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate + 'T23:59:59').toISOString(),
      scoringType,
      inviteUserIds: selectedFriends.length > 0 ? selectedFriends : undefined,
    }),
    onSuccess: (data) => {
      capture(AnalyticsEvent.CompetitionCreated, {
        competitionId: data.id,
        scoringType,
        invitedCount: selectedFriends.length,
      })
      queryClient.invalidateQueries({ queryKey: ['competitions'] })
      onCreated(data.id)
      handleClose()
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to create competition')
    },
  })

  const handleClose = () => {
    setStep(0); setName(''); setAnyCourse(true); setSelectedCourse(null)
    setStartDate(new Date().toISOString().slice(0, 10))
    const d = new Date(); d.setDate(d.getDate() + 7); setEndDate(d.toISOString().slice(0, 10))
    setScoringType('NET'); setSelectedFriends([]); setError('')
    onClose()
  }

  const steps = ['Name', 'Course', 'Dates', 'Scoring', 'Invite']
  const canNext = () => {
    if (step === 0) return name.trim().length > 0
    if (step === 1) return anyCourse || !!selectedCourse
    if (step === 2) return startDate && endDate && new Date(endDate) > new Date(startDate)
    return true
  }

  const toggleFriend = (id: number) => {
    setSelectedFriends((prev) => prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id])
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Create Competition</DialogTitle>
      <DialogContent>
        <MuiStepper activeStep={step} alternativeLabel sx={{ mb: 3 }}>
          {steps.map((s) => <Step key={s}><StepLabel>{s}</StepLabel></Step>)}
        </MuiStepper>

        {step === 0 && (
          <TextField
            fullWidth autoFocus label="Competition Name" placeholder="Weekend Showdown"
            value={name} onChange={(e) => setName(e.target.value.slice(0, 50))}
            helperText={`${name.length}/50`}
          />
        )}

        {step === 1 && (
          <Box>
            <FormControlLabel
              control={<Switch checked={anyCourse} onChange={(e) => { setAnyCourse(e.target.checked); setSelectedCourse(null) }} />}
              label="Any Course"
              sx={{ mb: 2 }}
            />
            {!anyCourse && (
              <>
                {selectedCourse ? (
                  <Chip
                    label={formatCourseName(selectedCourse.name)}
                    onDelete={() => setSelectedCourse(null)}
                    sx={{ mb: 1 }}
                  />
                ) : (
                  <CourseSearchInput
                    source="local"
                    variant="inline"
                    placeholder="Search your courses…"
                    onSelect={(c) => setSelectedCourse({ id: c.id, name: c.name })}
                  />
                )}
              </>
            )}
          </Box>
        )}

        {step === 2 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Start Date" type="date" fullWidth
              value={startDate} onChange={(e) => setStartDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="End Date" type="date" fullWidth
              value={endDate} onChange={(e) => setEndDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Box>
        )}

        {step === 3 && (
          <Box>
            <ToggleButtonGroup
              value={scoringType} exclusive fullWidth
              onChange={(_, v) => v && setScoringType(v)}
              sx={{ mb: 2 }}
            >
              <ToggleButton value="NET">Net</ToggleButton>
              <ToggleButton value="GROSS">Gross</ToggleButton>
              <ToggleButton value="STABLEFORD">Stableford</ToggleButton>
            </ToggleButtonGroup>
            <Typography variant="body2" color="text.secondary">
              {scoringType === 'NET'
                ? 'Net scoring adjusts for handicap, making it fair across all skill levels. A high-handicapper competes on equal footing with a scratch golfer.'
                : scoringType === 'GROSS'
                ? 'Gross scoring uses raw stroke count — no handicap adjustment. Best for players of similar skill.'
                : 'Stableford awards points per hole (net par = 2, birdie = 3, bogey = 1) — most points wins. A blow-up hole costs you nothing, so it rewards attacking golf. The classic society format.'}
            </Typography>
          </Box>
        )}

        {step === 4 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Select friends to invite (you can invite more later).
            </Typography>
            {!friends?.length ? (
              <Box sx={{ textAlign: 'center', py: 3 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  No mates added yet — create the competition first, then share an invite link.
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => { handleClose(); navigate('/friends') }}
                  sx={{ textTransform: 'none' }}
                >
                  Invite friends now
                </Button>
              </Box>
            ) : (
              <List dense sx={{ maxHeight: 250, overflow: 'auto' }}>
                {friends.map((f) => (
                  <ListItem key={f.id} disablePadding>
                    <ListItemButton onClick={() => toggleFriend(f.id)} dense>
                      <Checkbox edge="start" checked={selectedFriends.includes(f.id)} tabIndex={-1} disableRipple />
                      <ListItemText primary={f.name} />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            )}
          </Box>
        )}

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} sx={{ color: 'text.secondary' }}>Cancel</Button>
        {step > 0 && <Button onClick={() => setStep(step - 1)}>Back</Button>}
        {step < steps.length - 1 ? (
          <Button variant="contained" onClick={() => setStep(step + 1)} disabled={!canNext()}>Next</Button>
        ) : (
          <Button variant="contained" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !name.trim()}>
            {createMutation.isPending ? <CircularProgress size={20} /> : 'Create'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}

// ── Invite Dialog ────────────────────────────────────────────────────────────

function InviteDialog({ open, onClose, compId, existingUserIds }: {
  open: boolean; onClose: () => void; compId: string; existingUserIds: number[]
}) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<number[]>([])
  const { data: friends } = useQuery({ queryKey: ['friends'], queryFn: getFriends })

  const available = friends?.filter((f) => !existingUserIds.includes(f.id)) ?? []

  const mutation = useMutation({
    mutationFn: () => inviteToCompetition(compId, selected),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competition', compId] })
      setSelected([])
      onClose()
    },
  })

  const toggle = (id: number) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id])
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Invite Friends</DialogTitle>
      <DialogContent>
        {available.length === 0 ? (
          <Typography color="text.secondary" textAlign="center" sx={{ py: 3 }}>
            All your friends are already invited.
          </Typography>
        ) : (
          <List dense>
            {available.map((f) => (
              <ListItem key={f.id} disablePadding>
                <ListItemButton onClick={() => toggle(f.id)} dense>
                  <Checkbox edge="start" checked={selected.includes(f.id)} tabIndex={-1} disableRipple />
                  <ListItemText primary={f.name} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => mutation.mutate()} disabled={selected.length === 0 || mutation.isPending}>
          {mutation.isPending ? <CircularProgress size={20} /> : `Send ${selected.length} Invite${selected.length !== 1 ? 's' : ''}`}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Submit Round Dialog ──────────────────────────────────────────────────────

function SubmitRoundDialog({ open, onClose, compId }: { open: boolean; onClose: () => void; compId: string }) {
  const queryClient = useQueryClient()
  const { data: rounds, isLoading } = useQuery({
    queryKey: ['eligible-rounds', compId],
    queryFn: () => getEligibleRounds(compId),
    enabled: open,
  })

  const mutation = useMutation({
    mutationFn: (roundId: number) => submitRound(compId, roundId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competition', compId] })
      queryClient.invalidateQueries({ queryKey: ['competitions'] })
      onClose()
    },
  })

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Submit a Round</DialogTitle>
      <DialogContent>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
        ) : !rounds?.length ? (
          <Typography color="text.secondary" textAlign="center" sx={{ py: 4 }}>
            No eligible rounds found. Play a round within the competition window and complete it first.
          </Typography>
        ) : (
          <List>
            {rounds.map((r) => {
              const scoreStr = r.scoreToPar === 0 ? 'E' : r.scoreToPar > 0 ? `+${r.scoreToPar}` : `${r.scoreToPar}`
              return (
                <ListItem key={r.id} disablePadding>
                  <ListItemButton
                    onClick={() => mutation.mutate(r.id)}
                    disabled={mutation.isPending}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" fontWeight={600}>{formatCourseName(r.courseName)}</Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" fontWeight={700}>{r.totalStrokes}</Typography>
                            <Chip label={scoreStr} size="small" sx={{ fontWeight: 700, height: 22 }} />
                          </Box>
                        </Box>
                      }
                      secondary={`${new Date(r.playedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ${r.holesPlayed} holes`}
                    />
                  </ListItemButton>
                </ListItem>
              )
            })}
          </List>
        )}
        {mutation.isError && <Alert severity="error" sx={{ mt: 2 }}>{(mutation.error as any)?.response?.data?.error || 'Failed to submit round'}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Competition Detail View ──────────────────────────────────────────────────

function CompetitionDetailView({ id }: { id: string }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [submitOpen, setSubmitOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const { data: comp, isLoading, error } = useQuery({
    queryKey: ['competition', id],
    queryFn: () => getCompetition(id),
  })

  const respondMutation = useMutation({
    mutationFn: (response: 'ACCEPTED' | 'DECLINED') => respondToCompetition(id, response),
    onSuccess: (_data, response) => {
      if (response === 'ACCEPTED') {
        capture(AnalyticsEvent.CompetitionJoined, { competitionId: id })
      }
      queryClient.invalidateQueries({ queryKey: ['competition', id] })
      queryClient.invalidateQueries({ queryKey: ['competitions'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteCompetition(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competitions'] })
      navigate('/competitions')
    },
  })

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
  if (error || !comp) return <Alert severity="error" sx={{ m: 2 }}>Failed to load competition.</Alert>

  const isCreator = comp.creator.id === parseInt(String(user?.id))
  const sc = statusColor(comp.status)
  const isNet = comp.scoringType === 'NET'
  const isStableford = comp.scoringType === 'STABLEFORD'

  return (
    <Box sx={{ maxWidth: 700, mx: 'auto', px: 2, py: 2 }}>
      {/* Back button */}
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/competitions')} sx={{ mb: 1, textTransform: 'none', color: 'text.secondary' }}>
        Back
      </Button>

      {/* Invitation banner */}
      {comp.myStatus === 'INVITED' && (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          action={
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button size="small" variant="contained" onClick={() => respondMutation.mutate('ACCEPTED')} disabled={respondMutation.isPending}>
                Accept
              </Button>
              <Button size="small" onClick={() => respondMutation.mutate('DECLINED')} disabled={respondMutation.isPending}>
                Decline
              </Button>
            </Box>
          }
        >
          You've been invited to this competition by <ProfileLink userId={comp.creator.id} name={comp.creator.name} variant="body2" sx={{ display: 'inline' }} />
        </Alert>
      )}

      {/* Header */}
      <Card elevation={2} sx={{ mb: 3, background: 'linear-gradient(135deg, #2f6b4c 0%, #4a8a68 100%)', borderRadius: 2 }}>
        <CardContent sx={{ py: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box>
              <Typography variant="h5" sx={{ color: '#fff', fontWeight: 700, mb: 0.5 }}>
                {comp.name}
              </Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                {comp.course ? formatCourseName(comp.course.name) : 'Any Course'}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                <CalendarTodayIcon sx={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }} />
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                  {formatDateRange(comp.startDate, comp.endDate)}
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'flex-end' }}>
              <Chip label={comp.status} size="small" sx={{ bgcolor: sc.bg, color: sc.text, fontWeight: 700 }} />
              <Chip label={comp.scoringType} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 600 }} />
            </Box>
          </Box>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', mt: 1, display: 'block' }}>
            Created by <ProfileLink userId={comp.creator.id} name={comp.creator.name} variant="caption" sx={{ display: 'inline', color: 'rgba(255,255,255,0.7)' }} />
          </Typography>
        </CardContent>
      </Card>

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
        {comp.status === 'ACTIVE' && comp.myStatus === 'ACCEPTED' && !comp.hasSubmitted && (
          <Button variant="contained" startIcon={<GolfCourseIcon />} onClick={() => setSubmitOpen(true)} sx={{ textTransform: 'none' }}>
            Submit Round
          </Button>
        )}
        {isCreator && (
          <Button variant="outlined" startIcon={<PersonAddIcon />} onClick={() => setInviteOpen(true)} sx={{ textTransform: 'none' }}>
            Invite Friends
          </Button>
        )}
        {isCreator && comp.status === 'UPCOMING' && (
          <Button color="error" startIcon={<DeleteIcon />} onClick={() => setDeleteConfirm(true)} sx={{ textTransform: 'none', ml: 'auto' }}>
            Delete
          </Button>
        )}
      </Box>

      {/* Leaderboard */}
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>Leaderboard</Typography>
      {comp.leaderboard.length === 0 && comp.noSubmission.length === 0 ? (
        <Typography color="text.secondary" sx={{ mb: 3 }}>No rounds submitted yet.</Typography>
      ) : (
        <Card elevation={1} sx={{ mb: 3, borderRadius: 2, overflow: 'hidden' }}>
          {comp.leaderboard.map((entry, idx) => {
            const isMe = entry.userId === parseInt(String(user?.id))
            const displayScore = isNet ? entry.netScoreToPar : entry.scoreToPar
            const displayLabel = displayScore != null ? scoreLabel(Math.round(displayScore)) : '–'
            return (
              <Box key={entry.userId}>
                {idx > 0 && <Divider />}
                <Box sx={{
                  display: 'flex', alignItems: 'center', px: 2, py: 1.5,
                  bgcolor: isMe ? 'rgba(224,185,92,0.08)' : undefined,
                }}>
                  <Box sx={{ width: 32, textAlign: 'center', flexShrink: 0 }}>
                    {entry.rank === 1 ? (
                      <EmojiEventsIcon sx={{ color: '#e0b95c', fontSize: 22 }} />
                    ) : (
                      <Typography variant="body2" fontWeight={700} color="text.secondary">{entry.rank}</Typography>
                    )}
                  </Box>
                  <Box sx={{ flex: 1, ml: 1.5, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <ProfileLink userId={entry.userId} name={entry.name} variant="body2" sx={{ fontWeight: isMe ? 700 : 500 }} />
                      {isMe && <Typography variant="body2" color="text.secondary">(You)</Typography>}
                    </Box>
                    {!comp.course && (
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {formatCourseName(entry.courseName)}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {new Date(entry.playedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                    <Typography variant="body1" fontWeight={800}>{entry.grossScore}</Typography>
                    {isNet && entry.netScore != null && (
                      <Typography variant="caption" color="text.secondary">Net {Math.round(entry.netScore)}</Typography>
                    )}
                  </Box>
                  {isStableford ? (
                    <Chip
                      label={`${entry.stablefordPoints ?? 0} pts`}
                      size="small"
                      sx={{
                        ml: 1.5, fontWeight: 700, height: 24,
                        bgcolor: entry.rank === 1 ? '#e0b95c' : '#4a8a68',
                        color: '#fff',
                      }}
                    />
                  ) : (
                    <Chip
                      label={displayLabel}
                      size="small"
                      sx={{
                        ml: 1.5, fontWeight: 700, height: 24,
                        bgcolor: displayScore != null && displayScore < 0 ? '#e0b95c'
                          : displayScore === 0 ? '#4a8a68'
                          : '#5c86a8',
                        color: '#fff',
                      }}
                    />
                  )}
                </Box>
              </Box>
            )
          })}

          {/* Participants with no submission */}
          {comp.noSubmission.length > 0 && (
            <>
              <Divider />
              {comp.noSubmission.map((p) => {
                const isMe = p.userId === parseInt(String(user?.id))
                return (
                  <Box key={p.userId} sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.5, bgcolor: isMe ? 'rgba(224,185,92,0.05)' : undefined }}>
                    <Box sx={{ width: 32, textAlign: 'center', flexShrink: 0 }}>
                      <Typography variant="body2" color="text.disabled">–</Typography>
                    </Box>
                    <Box sx={{ ml: 1.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <ProfileLink userId={p.userId} name={p.name} variant="body2" sx={{ color: 'text.secondary' }} />
                      {isMe && <Typography variant="body2" color="text.disabled">(You)</Typography>}
                    </Box>
                    <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto' }}>
                      No round submitted
                    </Typography>
                  </Box>
                )
              })}
            </>
          )}
        </Card>
      )}

      {/* Participants */}
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Participants</Typography>
      <Card elevation={1} sx={{ mb: 3, borderRadius: 2 }}>
        <List dense disablePadding>
          {comp.participants.map((p, idx) => (
            <Box key={p.userId}>
              {idx > 0 && <Divider />}
              <ListItem>
                <ListItemText primary={<ProfileLink userId={p.userId} name={p.name} variant="body2" />} />
                <Chip
                  label={p.status}
                  size="small"
                  variant="outlined"
                  color={p.status === 'ACCEPTED' ? 'success' : p.status === 'INVITED' ? 'warning' : 'default'}
                  sx={{ fontSize: '0.65rem', height: 22 }}
                />
              </ListItem>
            </Box>
          ))}
        </List>
      </Card>

      {/* Dialogs */}
      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        compId={id}
        existingUserIds={comp.participants.map((p) => p.userId)}
      />
      <SubmitRoundDialog open={submitOpen} onClose={() => setSubmitOpen(false)} compId={id} />
      <Dialog open={deleteConfirm} onClose={() => setDeleteConfirm(false)}>
        <DialogTitle>Delete Competition</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to delete "{comp.name}"? This cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(false)}>Cancel</Button>
          <Button color="error" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

// ── Competitions List View ───────────────────────────────────────────────────

function CompetitionsListView() {
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['competitions'],
    queryFn: getCompetitions,
  })

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>

  const { active = [], upcoming = [], completed = [] } = data ?? {}
  const isEmpty = active.length === 0 && upcoming.length === 0 && completed.length === 0

  return (
    <Box>
      <Box sx={{ maxWidth: 600, mx: 'auto', px: 2, pb: 3, position: 'relative' }}>
        <PageHeader title="Competitions" subtitle="Compete with friends" />
        {isEmpty ? (
          <EmptyState
            icon={<EmojiEventsIcon sx={{ fontSize: 36 }} />}
            title="Crown a champion"
            description="Set up a weekend showdown or a long-running club ladder — pick the format, invite your mates, and let the leaderboard do the talking."
            primary={{ label: 'Create a competition', onClick: () => setCreateOpen(true), icon: <AddIcon /> }}
            secondary={{ label: 'Invite mates first', to: '/friends' }}
          />
        ) : (
          <>
            <Section title="Active" comps={active} onSelect={(id) => navigate(`/competitions/${id}`)} />
            <Section title="Upcoming" comps={upcoming} onSelect={(id) => navigate(`/competitions/${id}`)} />
            <Section title="Completed" comps={completed} onSelect={(id) => navigate(`/competitions/${id}`)} defaultOpen={false} />
          </>
        )}

        {!isEmpty && (
          <Fab
            color="primary"
            aria-label="Create competition"
            onClick={() => setCreateOpen(true)}
            sx={{
              position: 'fixed',
              bottom: { xs: 'calc(76px + env(safe-area-inset-bottom, 0px))', md: 24 },
              right: 24,
              // Above BottomNav (1200) so the affordance to create another
              // competition is never obscured.
              zIndex: 1250,
            }}
          >
            <AddIcon />
          </Fab>
        )}
      </Box>

      {/* Stay on the list after creating so the FAB remains in reach for
          additional competitions; user can tap the new card to open detail. */}
      <CreateCompDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { /* list re-fetches via cache invalidation */ }}
      />
    </Box>
  )
}

// ── Main Page (routes between list and detail) ───────────────────────────────

export default function CompetitionsPage() {
  const { id } = useParams<{ id: string }>()

  if (id) return <CompetitionDetailView id={id} />
  return <CompetitionsListView />
}
