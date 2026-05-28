import { useState } from 'react'
import {
  Box, Typography, Card, CardContent, CardActionArea, Chip, Button,
  CircularProgress, Fab, Alert, Avatar,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, ToggleButton, ToggleButtonGroup,
  List, ListItem, ListItemButton, ListItemText, Checkbox,
  Divider,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import PersonIcon from '@mui/icons-material/Person'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import GolfCourseIcon from '@mui/icons-material/GolfCourse'
import CancelIcon from '@mui/icons-material/Cancel'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import LogoutIcon from '@mui/icons-material/Logout'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import {
  getTeeTimes, getTeeTime, createTeeTime,
  joinTeeTime, respondToTeeTime, withdrawFromTeeTime,
  cancelTeeTime, inviteToTeeTime,
} from '../api/teetimes'
import { getFriends } from '../api/friends'
import { useAuth } from '../contexts/AuthContext'
import PageHeader from '../components/PageHeader'
import ProfileLink from '../components/ProfileLink'
import CourseSearchInput from '../components/CourseSearchInput'
import type { TeeTimeSummary } from '../types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeDate(dt: string): string {
  const d = new Date(dt)
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'

  const dayOfWeek = d.toLocaleDateString('en-AU', { weekday: 'long' })
  if (diffDays <= 6) return `This ${dayOfWeek}`
  if (diffDays <= 13) return `Next ${dayOfWeek}`
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

function formatDateTime(dt: string): string {
  const d = new Date(dt)
  return `${d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}`
}

function getNextSaturday8am(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = (6 - day + 7) % 7 || 7
  d.setDate(d.getDate() + diff)
  d.setHours(8, 0, 0, 0)
  return d.toISOString().slice(0, 16)
}

// ── Tee Time Card ───────────────────────────────────────────────────────────

function TeeTimeCard({ tt, onClick, action }: { tt: TeeTimeSummary; onClick?: () => void; action?: React.ReactNode }) {
  const courseName = tt.courseName || 'Course TBD'
  return (
    <Card variant="outlined" sx={{ mb: 1.5, borderRadius: 2 }}>
      <CardActionArea onClick={onClick} disabled={!onClick} sx={{ p: 0 }}>
        <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                {courseName}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                <AccessTimeIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">
                  {relativeDate(tt.dateTime)} · {new Date(tt.dateTime).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                <PersonIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">
                  {tt.spotsFilled}/{tt.spotsTotal} spots filled
                </Typography>
              </Box>
              {tt.notes && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block', fontStyle: 'italic' }}>
                  {tt.notes}
                </Typography>
              )}
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5, ml: 1 }}>
              {tt.participants.filter(p => p.status === 'CONFIRMED').slice(0, 3).map((p) => (
                <Chip key={p.userId} label={p.name.split(' ')[0]} size="small" sx={{ height: 22, fontSize: '0.7rem' }} />
              ))}
            </Box>
          </Box>
          {action && <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>{action}</Box>}
        </CardContent>
      </CardActionArea>
    </Card>
  )
}

// ── Create Dialog ───────────────────────────────────────────────────────────

function CreateTeeTimeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [selectedCourse, setSelectedCourse] = useState<{ name: string } | null>(null)
  const [dateTime, setDateTime] = useState(getNextSaturday8am())
  const [spotsTotal, setSpotsTotal] = useState(4)
  const [visibility, setVisibility] = useState<'FRIENDS' | 'INVITED_ONLY'>('FRIENDS')
  const [notes, setNotes] = useState('')
  const [selectedFriends, setSelectedFriends] = useState<number[]>([])
  const [error, setError] = useState('')

  const { data: friends } = useQuery({
    queryKey: ['friends'],
    queryFn: getFriends,
    enabled: visibility === 'INVITED_ONLY',
  })

  const createMut = useMutation({
    mutationFn: createTeeTime,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teetimes'] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      onClose()
      resetForm()
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error || 'Failed to create')
    },
  })

  const resetForm = () => {
    setSelectedCourse(null)
    setDateTime(getNextSaturday8am())
    setSpotsTotal(4)
    setVisibility('FRIENDS')
    setNotes('')
    setSelectedFriends([])
    setError('')
  }

  const handleCreate = () => {
    setError('')
    createMut.mutate({
      courseName: selectedCourse?.name,
      dateTime: new Date(dateTime).toISOString(),
      spotsTotal,
      notes: notes.trim() || undefined,
      visibility,
      inviteUserIds: visibility === 'INVITED_ONLY' && selectedFriends.length > 0 ? selectedFriends : undefined,
    })
  }

  const toggleFriend = (id: number) => {
    setSelectedFriends((prev) => prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id])
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>New Tee Time</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <Box>
          <Typography variant="body2" sx={{ mb: 0.5, fontWeight: 600 }}>Course (optional)</Typography>
          {selectedCourse ? (
            <Chip
              label={selectedCourse.name}
              onDelete={() => setSelectedCourse(null)}
              sx={{ maxWidth: '100%' }}
            />
          ) : (
            <CourseSearchInput
              source="external"
              variant="inline"
              placeholder="Search 30,000+ courses…"
              onSelect={(c) => setSelectedCourse({ name: c.name })}
            />
          )}
        </Box>

        <TextField
          label="Date & Time"
          type="datetime-local"
          value={dateTime}
          onChange={(e) => setDateTime(e.target.value)}
          size="small"
          fullWidth
          slotProps={{ inputLabel: { shrink: true } }}
        />

        <Box>
          <Typography variant="body2" sx={{ mb: 0.5, fontWeight: 600 }}>Group size</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button size="small" variant="outlined" onClick={() => setSpotsTotal(Math.max(2, spotsTotal - 1))} disabled={spotsTotal <= 2}>−</Button>
            <Typography sx={{ minWidth: 24, textAlign: 'center', fontWeight: 700 }}>{spotsTotal}</Typography>
            <Button size="small" variant="outlined" onClick={() => setSpotsTotal(Math.min(8, spotsTotal + 1))} disabled={spotsTotal >= 8}>+</Button>
            <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>players (including you)</Typography>
          </Box>
        </Box>

        <Box>
          <Typography variant="body2" sx={{ mb: 0.5, fontWeight: 600 }}>Who can see this?</Typography>
          <ToggleButtonGroup
            value={visibility}
            exclusive
            onChange={(_, v) => v && setVisibility(v)}
            size="small"
            fullWidth
          >
            <ToggleButton value="FRIENDS">All friends</ToggleButton>
            <ToggleButton value="INVITED_ONLY">Invite only</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <TextField
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 200))}
          size="small"
          fullWidth
          placeholder="Walking? Carts? Post-round beers?"
          helperText={`${notes.length}/200`}
        />

        {visibility === 'INVITED_ONLY' && friends && friends.length > 0 && (
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>Invite friends</Typography>
            <List dense sx={{ maxHeight: 200, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              {friends.map((f) => (
                <ListItem key={f.id} disablePadding>
                  <ListItemButton onClick={() => toggleFriend(f.id)} dense>
                    <Checkbox edge="start" checked={selectedFriends.includes(f.id)} tabIndex={-1} disableRipple size="small" />
                    <ListItemText primary={f.name} />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Box>
        )}

        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleCreate} disabled={createMut.isPending}>
          {createMut.isPending ? 'Creating...' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Invite Dialog ───────────────────────────────────────────────────────────

function InviteDialog({ open, onClose, teeTimeId, existingUserIds }: { open: boolean; onClose: () => void; teeTimeId: string; existingUserIds: number[] }) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<number[]>([])

  const { data: friends } = useQuery({ queryKey: ['friends'], queryFn: getFriends })
  const available = friends?.filter((f) => !existingUserIds.includes(f.id)) ?? []

  const inviteMut = useMutation({
    mutationFn: () => inviteToTeeTime(teeTimeId, selected),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teetimes'] })
      queryClient.invalidateQueries({ queryKey: ['teetime', teeTimeId] })
      onClose()
      setSelected([])
    },
  })

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Invite Friends</DialogTitle>
      <DialogContent>
        {available.length === 0 ? (
          <Typography color="text.secondary">No friends to invite.</Typography>
        ) : (
          <List dense>
            {available.map((f) => (
              <ListItem key={f.id} disablePadding>
                <ListItemButton onClick={() => setSelected((p) => p.includes(f.id) ? p.filter((x) => x !== f.id) : [...p, f.id])} dense>
                  <Checkbox edge="start" checked={selected.includes(f.id)} tabIndex={-1} disableRipple size="small" />
                  <ListItemText primary={f.name} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => inviteMut.mutate()} disabled={selected.length === 0 || inviteMut.isPending}>
          Invite ({selected.length})
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Detail View ─────────────────────────────────────────────────────────────

function TeeTimeDetailView({ id }: { id: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [showInvite, setShowInvite] = useState(false)
  const [confirmJoin, setConfirmJoin] = useState(false)

  const { data: tt, isLoading } = useQuery({
    queryKey: ['teetime', id],
    queryFn: () => getTeeTime(id),
  })

  const joinMut = useMutation({
    mutationFn: () => joinTeeTime(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['teetime', id] }); queryClient.invalidateQueries({ queryKey: ['teetimes'] }); setConfirmJoin(false) },
  })
  const respondMut = useMutation({
    mutationFn: (response: 'CONFIRMED' | 'DECLINED') => respondToTeeTime(id, response),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['teetime', id] }); queryClient.invalidateQueries({ queryKey: ['teetimes'] }) },
  })
  const withdrawMut = useMutation({
    mutationFn: () => withdrawFromTeeTime(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['teetime', id] }); queryClient.invalidateQueries({ queryKey: ['teetimes'] }) },
  })
  const cancelMut = useMutation({
    mutationFn: () => cancelTeeTime(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['teetime', id] }); queryClient.invalidateQueries({ queryKey: ['teetimes'] }) },
  })

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
  if (!tt) return <Alert severity="error">Tee time not found</Alert>

  const isCreator = tt.creatorId === Number(user?.id)
  const courseName = tt.courseName || 'Course TBD'
  const confirmed = tt.participants.filter((p) => p.status === 'CONFIRMED')
  const invited = tt.participants.filter((p) => p.status === 'INVITED')
  const declined = tt.participants.filter((p) => p.status === 'DECLINED' || p.status === 'WITHDRAWN')
  const spotsRemaining = tt.spotsTotal - confirmed.length

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto' }}>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/teetimes')} sx={{ mb: 1, textTransform: 'none' }}>
        Back
      </Button>

      {/* Header card */}
      <Card sx={{ mb: 2, background: 'linear-gradient(135deg, #1a3a2a 0%, #2d5e42 100%)', color: '#fff', borderRadius: 3 }}>
        <CardContent sx={{ py: 3 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>{courseName}</Typography>
          <Typography variant="body1" sx={{ opacity: 0.9, mb: 1 }}>
            {formatDateTime(tt.dateTime)}
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.8 }}>
            Organised by <ProfileLink userId={tt.creator.id} name={tt.creator.name} variant="body2" sx={{ display: 'inline', color: 'rgba(255,255,255,0.9)' }} />
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
            {/* Show status only when it's a meaningful non-default state — avoids duplicating 'Open' with visibility */}
            {(tt.status === 'CANCELLED' || tt.status === 'FULL' || tt.status === 'COMPLETED') && (
              <Chip label={tt.status} size="small" sx={{ bgcolor: tt.status === 'CANCELLED' ? '#c62828' : 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700, fontSize: '0.7rem' }} />
            )}
            <Chip label={tt.visibility === 'FRIENDS' ? 'Open' : 'Invite Only'} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: '0.7rem' }} />
          </Box>
        </CardContent>
      </Card>

      {/* Invitation banner */}
      {tt.myStatus === 'INVITED' && (
        <Alert severity="info" sx={{ mb: 2 }} action={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" variant="contained" color="success" onClick={() => respondMut.mutate('CONFIRMED')} disabled={respondMut.isPending}>Accept</Button>
            <Button size="small" variant="outlined" onClick={() => respondMut.mutate('DECLINED')} disabled={respondMut.isPending}>Decline</Button>
          </Box>
        }>
          You've been invited!
        </Alert>
      )}

      {tt.notes && (
        <Card variant="outlined" sx={{ mb: 2, borderRadius: 2 }}>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>"{tt.notes}"</Typography>
          </CardContent>
        </Card>
      )}

      {/* Spots visualization */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Spots</Typography>
        <Box sx={{ display: 'flex', gap: 0.75 }}>
          {Array.from({ length: tt.spotsTotal }).map((_, i) => (
            <Avatar
              key={i}
              sx={{
                width: 36, height: 36,
                bgcolor: i < confirmed.length ? '#2d5e42' : 'rgba(0,0,0,0.08)',
                color: i < confirmed.length ? '#fff' : 'rgba(0,0,0,0.3)',
                fontSize: '0.8rem', fontWeight: 700,
              }}
            >
              {i < confirmed.length ? confirmed[i].name.charAt(0) : '?'}
            </Avatar>
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          {spotsRemaining > 0 ? `${spotsRemaining} spot${spotsRemaining > 1 ? 's' : ''} remaining` : 'Group is full'}
        </Typography>
      </Box>

      {/* Participants */}
      <Typography variant="subtitle2" sx={{ mb: 1 }}>Participants</Typography>
      <Card variant="outlined" sx={{ mb: 2, borderRadius: 2 }}>
        {confirmed.map((p, i) => (
          <Box key={p.userId}>
            {i > 0 && <Divider />}
            <Box sx={{ px: 2, py: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <ProfileLink userId={p.userId} name={p.name} variant="body2" />
                {p.userId === Number(user?.id) && <Typography variant="body2" color="text.secondary">(You)</Typography>}
              </Box>
              <Chip label="Confirmed" size="small" sx={{ bgcolor: '#e8f5e9', color: '#2d5e42', fontWeight: 600, fontSize: '0.65rem', height: 20 }} />
            </Box>
          </Box>
        ))}
        {invited.map((p) => (
          <Box key={p.userId}>
            <Divider />
            <Box sx={{ px: 2, py: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <ProfileLink userId={p.userId} name={p.name} variant="body2" />
              <Chip label="Pending" size="small" sx={{ bgcolor: '#fff3e0', color: '#e65100', fontWeight: 600, fontSize: '0.65rem', height: 20 }} />
            </Box>
          </Box>
        ))}
        {declined.map((p) => (
          <Box key={p.userId}>
            <Divider />
            <Box sx={{ px: 2, py: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <ProfileLink userId={p.userId} name={p.name} variant="body2" sx={{ opacity: 0.5 }} />
              <Chip label={p.status === 'WITHDRAWN' ? 'Withdrew' : 'Declined'} size="small" sx={{ bgcolor: '#fce4ec', color: '#c62828', fontWeight: 600, fontSize: '0.65rem', height: 20 }} />
            </Box>
          </Box>
        ))}
      </Card>

      {/* Action buttons */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        {isCreator && tt.status !== 'CANCELLED' && tt.status !== 'COMPLETED' && (
          <>
            <Button variant="outlined" startIcon={<PersonAddIcon />} onClick={() => setShowInvite(true)} sx={{ textTransform: 'none' }}>
              Invite Friends
            </Button>
            <Button variant="outlined" color="error" startIcon={<CancelIcon />} onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending} sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
          </>
        )}

        {!isCreator && tt.myStatus === 'CONFIRMED' && tt.status !== 'CANCELLED' && tt.status !== 'COMPLETED' && (
          <Button variant="outlined" color="warning" startIcon={<LogoutIcon />} onClick={() => withdrawMut.mutate()} disabled={withdrawMut.isPending} sx={{ textTransform: 'none' }}>
            Withdraw
          </Button>
        )}

        {tt.canJoin && (
          <Button variant="contained" onClick={() => setConfirmJoin(true)} sx={{ textTransform: 'none' }}>
            Join
          </Button>
        )}

        {tt.course && tt.status !== 'CANCELLED' && tt.myStatus === 'CONFIRMED' && (
          <Button variant="contained" startIcon={<GolfCourseIcon />} onClick={() => navigate(`/courses`)} sx={{ textTransform: 'none' }}>
            Start Round
          </Button>
        )}
      </Box>

      {showInvite && (
        <InviteDialog
          open={showInvite}
          onClose={() => setShowInvite(false)}
          teeTimeId={id}
          existingUserIds={tt.participants.map((p) => p.userId)}
        />
      )}

      {/* Join confirmation dialog */}
      <Dialog open={confirmJoin} onClose={() => setConfirmJoin(false)}>
        <DialogTitle>Join tee time?</DialogTitle>
        <DialogContent>
          <Typography>Join {tt.creator.name}'s round at {courseName} on {formatDateTime(tt.dateTime)}?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmJoin(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => joinMut.mutate()} disabled={joinMut.isPending}>Join</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

// ── List View ───────────────────────────────────────────────────────────────

function TeeTimesListView() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [joinTarget, setJoinTarget] = useState<TeeTimeSummary | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['teetimes'],
    queryFn: getTeeTimes,
  })

  const joinMut = useMutation({
    mutationFn: (id: string) => joinTeeTime(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teetimes'] })
      setJoinTarget(null)
    },
  })

  const respondMut = useMutation({
    mutationFn: ({ id, response }: { id: string; response: 'CONFIRMED' | 'DECLINED' }) => respondToTeeTime(id, response),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teetimes'] }),
  })

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>

  const invitations = data?.invitations ?? []
  const myUpcoming = data?.myUpcoming ?? []
  const friendsTT = data?.friendsTeeTimes ?? []
  const isEmpty = invitations.length === 0 && myUpcoming.length === 0 && friendsTT.length === 0

  return (
    <Box>
      <PageHeader title="Tee Times" subtitle="Organise rounds with friends" />
      <Box sx={{ maxWidth: 600, mx: 'auto', px: 2, py: 3 }}>
      {isEmpty ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <GolfCourseIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" sx={{ mb: 1, fontWeight: 600 }}>
            No upcoming rounds
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Create a tee time and invite your mates.
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setShowCreate(true)} sx={{ textTransform: 'none' }}>
            Create Tee Time
          </Button>
        </Box>
      ) : (
        <>
          {/* Invitations */}
          {invitations.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, color: '#1a3a5c', fontWeight: 700 }}>
                Invitations ({invitations.length})
              </Typography>
              {invitations.map((tt) => (
                <Card key={tt.id} variant="outlined" sx={{ mb: 1.5, borderRadius: 2, borderColor: '#1a3a5c', borderWidth: 2 }}>
                  <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{tt.courseName || 'Course TBD'}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {relativeDate(tt.dateTime)} · {new Date(tt.dateTime).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      From {tt.creatorName} · {tt.spotsFilled}/{tt.spotsTotal} confirmed
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
                      <Button size="small" variant="contained" color="success" onClick={() => respondMut.mutate({ id: tt.id, response: 'CONFIRMED' })} disabled={respondMut.isPending} sx={{ textTransform: 'none' }}>
                        Accept
                      </Button>
                      <Button size="small" variant="outlined" onClick={() => respondMut.mutate({ id: tt.id, response: 'DECLINED' })} disabled={respondMut.isPending} sx={{ textTransform: 'none' }}>
                        Decline
                      </Button>
                      <Box sx={{ flex: 1 }} />
                      <Button size="small" onClick={() => navigate(`/teetimes/${tt.id}`)} sx={{ textTransform: 'none' }}>Details</Button>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}

          {/* My upcoming */}
          {myUpcoming.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                My Upcoming ({myUpcoming.length})
              </Typography>
              {myUpcoming.map((tt) => (
                <TeeTimeCard key={tt.id} tt={tt} onClick={() => navigate(`/teetimes/${tt.id}`)} />
              ))}
            </Box>
          )}

          {/* Friends' open tee times */}
          {friendsTT.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                Friends Looking for Players
              </Typography>
              {friendsTT.map((tt) => (
                <TeeTimeCard
                  key={tt.id}
                  tt={tt}
                  onClick={() => navigate(`/teetimes/${tt.id}`)}
                  action={
                    <Button size="small" variant="contained" onClick={() => setJoinTarget(tt)} sx={{ textTransform: 'none' }}>
                      Join
                    </Button>
                  }
                />
              ))}
            </Box>
          )}

          <Fab
            color="primary"
            onClick={() => setShowCreate(true)}
            sx={{ position: 'fixed', bottom: { xs: 'calc(68px + env(safe-area-inset-bottom, 0px))', md: 24 }, right: 16 }}
          >
            <AddIcon />
          </Fab>
        </>
      )}

      <CreateTeeTimeDialog open={showCreate} onClose={() => setShowCreate(false)} />

      {/* Join confirmation */}
      <Dialog open={!!joinTarget} onClose={() => setJoinTarget(null)}>
        <DialogTitle>Join tee time?</DialogTitle>
        <DialogContent>
          {joinTarget && (
            <Typography>
              Join {joinTarget.creatorName}'s round at {joinTarget.courseName || 'Course TBD'} on {formatDateTime(joinTarget.dateTime)}?
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setJoinTarget(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => joinTarget && joinMut.mutate(joinTarget.id)} disabled={joinMut.isPending}>Join</Button>
        </DialogActions>
      </Dialog>
      </Box>
    </Box>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function TeeTimesPage() {
  const { id } = useParams()
  if (id) return <TeeTimeDetailView id={id} />
  return <TeeTimesListView />
}
