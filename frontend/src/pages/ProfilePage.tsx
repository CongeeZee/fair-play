import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Box, Typography, Card, CardContent, CircularProgress, Chip, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton,
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import PersonRemoveIcon from '@mui/icons-material/PersonRemove'
import BlockIcon from '@mui/icons-material/Block'
import GolfCourseIcon from '@mui/icons-material/GolfCourse'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { getUserProfile, getHeadToHead, getUserHandicapHistory, updateProfile } from '../api/users'
import { removeFriend, blockUser } from '../api/friends'
import { useAuth } from '../contexts/AuthContext'
import { formatCourseName, timeAgo } from '../utils'
import PageHeader from '../components/PageHeader'
import type { UserProfile, HeadToHead } from '../types'

function avatarColor(userId: number): string {
  const colors = ['#1a3a2a', '#2d5e42', '#c9a84c', '#1a3a5c', '#8B4513', '#4a148c', '#00695c', '#b71c1c']
  return colors[userId % colors.length]
}

function scoreLabel(val: number | null) {
  if (val == null) return '-'
  if (val === 0) return 'E'
  return val > 0 ? `+${val}` : `${val}`
}

function scoreLabelFloat(val: number | null) {
  if (val == null) return '-'
  if (val === 0) return 'E'
  return val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1)
}

function ProfileHeader({ profile, isOwn, onEdit }: { profile: UserProfile; isOwn: boolean; onEdit: () => void }) {
  const navigate = useNavigate()
  return (
    <Box sx={{ textAlign: 'center', mb: 3 }}>
      <Box sx={{
        width: 64, height: 64, borderRadius: '50%', mx: 'auto', mb: 1.5,
        bgcolor: avatarColor(profile.id), display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Typography variant="h4" sx={{ color: '#fff', fontWeight: 700 }}>
          {profile.name.charAt(0).toUpperCase()}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>{profile.name}</Typography>
        {isOwn && (
          <IconButton size="small" onClick={onEdit}><EditIcon fontSize="small" /></IconButton>
        )}
      </Box>
      {profile.handicapIndex != null && (
        <Typography variant="h4" sx={{ fontWeight: 800, color: 'primary.main', mt: 0.5 }}>
          {profile.handicapIndex.toFixed(1)}
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        Member since {new Date(profile.memberSince).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
      </Typography>
      {profile.isLive && profile.liveRoundId && (
        <Chip
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{
                width: 8, height: 8, borderRadius: '50%', bgcolor: '#4caf50',
                animation: 'pulse 2s infinite',
                '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.4 } },
              }} />
              Playing now{profile.liveCourseName ? ` at ${formatCourseName(profile.liveCourseName)}` : ''}
            </Box>
          }
          onClick={() => navigate(`/live/${profile.liveRoundId}`)}
          sx={{ mt: 1, bgcolor: 'rgba(76,175,80,0.15)', color: '#2e7d32', fontWeight: 700, cursor: 'pointer' }}
        />
      )}
      {!isOwn && profile.mutualFriends > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {profile.mutualFriends} mutual friend{profile.mutualFriends !== 1 ? 's' : ''}
        </Typography>
      )}
    </Box>
  )
}

function StatsRow({ profile }: { profile: UserProfile }) {
  const stats = [
    { label: 'Rounds Played', value: String(profile.roundsPlayed) },
    { label: 'Avg Score', value: scoreLabelFloat(profile.averageScoreToPar) },
    { label: 'Best Score', value: scoreLabel(profile.bestScoreToPar) },
  ]
  return (
    <Box sx={{ display: 'flex', gap: 1.5, mb: 3 }}>
      {stats.map((s) => (
        <Card key={s.label} elevation={1} sx={{ flex: 1, borderRadius: 2 }}>
          <CardContent sx={{ textAlign: 'center', py: 1.5, px: 1, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="h5" sx={{ fontWeight: 800, color: 'primary.main' }}>{s.value}</Typography>
            <Typography variant="caption" color="text.secondary">{s.label}</Typography>
          </CardContent>
        </Card>
      ))}
    </Box>
  )
}

function HeadToHeadSection({ h2h, viewerName, targetName, targetId }: {
  h2h: HeadToHead; viewerName: string; targetName: string; targetId: number
}) {
  const navigate = useNavigate()
  const total = h2h.viewerWins + h2h.targetWins + h2h.draws

  if (total === 0) {
    return (
      <Card elevation={1} sx={{ mb: 3, borderRadius: 2 }}>
        <CardContent sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            You haven't played the same courses yet. Challenge {targetName} to a round!
          </Typography>
          <Button
            variant="contained"
            size="small"
            onClick={() => navigate(`/teetimes?invite=${targetId}`)}
            sx={{ textTransform: 'none' }}
          >
            Create Tee Time
          </Button>
        </CardContent>
      </Card>
    )
  }

  const viewerPct = total > 0 ? (h2h.viewerWins / total) * 100 : 50
  const targetPct = total > 0 ? (h2h.targetWins / total) * 100 : 50

  return (
    <Card elevation={1} sx={{ mb: 3, borderRadius: 2 }}>
      <CardContent>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2, textTransform: 'uppercase', letterSpacing: 1, color: 'text.secondary' }}>
          Head to Head
        </Typography>

        {/* Win/loss bar */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Box sx={{ textAlign: 'center', minWidth: 50 }}>
            <Typography variant="h4" sx={{ fontWeight: 800, color: '#2d5e42' }}>{h2h.viewerWins}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap>You</Typography>
          </Box>
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden' }}>
              <Box sx={{ width: `${viewerPct}%`, bgcolor: '#2d5e42', transition: 'width 0.5s' }} />
              {h2h.draws > 0 && (
                <Box sx={{ width: `${(h2h.draws / total) * 100}%`, bgcolor: '#e0e0e0' }} />
              )}
              <Box sx={{ width: `${targetPct}%`, bgcolor: '#c9a84c', transition: 'width 0.5s' }} />
            </Box>
            {h2h.draws > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 0.25 }}>
                {h2h.draws} draw{h2h.draws !== 1 ? 's' : ''}
              </Typography>
            )}
          </Box>
          <Box sx={{ textAlign: 'center', minWidth: 50 }}>
            <Typography variant="h4" sx={{ fontWeight: 800, color: '#c9a84c' }}>{h2h.targetWins}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap>{targetName.split(' ')[0]}</Typography>
          </Box>
        </Box>

        {/* Shared courses table */}
        {h2h.sharedCourses.length > 0 && (
          <TableContainer sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }}>Course</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.7rem' }}>Your Best</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.7rem' }}>Their Best</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.7rem' }}>Your Avg</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.7rem' }}>Their Avg</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {h2h.sharedCourses.map((sc) => (
                  <TableRow key={sc.courseId}>
                    <TableCell sx={{ fontSize: '0.75rem', maxWidth: 120 }} noWrap>{formatCourseName(sc.courseName)}</TableCell>
                    <TableCell align="center" sx={{
                      fontSize: '0.75rem', fontWeight: 600,
                      color: sc.viewerBest <= sc.targetBest ? '#2d5e42' : 'text.primary',
                    }}>{scoreLabel(sc.viewerBest)}</TableCell>
                    <TableCell align="center" sx={{
                      fontSize: '0.75rem', fontWeight: 600,
                      color: sc.targetBest <= sc.viewerBest ? '#2d5e42' : 'text.primary',
                    }}>{scoreLabel(sc.targetBest)}</TableCell>
                    <TableCell align="center" sx={{
                      fontSize: '0.75rem',
                      color: sc.viewerAvg <= sc.targetAvg ? '#2d5e42' : 'text.primary',
                    }}>{scoreLabelFloat(sc.viewerAvg)}</TableCell>
                    <TableCell align="center" sx={{
                      fontSize: '0.75rem',
                      color: sc.targetAvg <= sc.viewerAvg ? '#2d5e42' : 'text.primary',
                    }}>{scoreLabelFloat(sc.targetAvg)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  )
}

function HandicapChart({ viewerId, targetId, viewerName, targetName }: {
  viewerId: number; targetId: number; viewerName: string; targetName: string
}) {
  const { data: viewerHistory } = useQuery({
    queryKey: ['handicap-history', viewerId],
    queryFn: () => getUserHandicapHistory(viewerId),
  })
  const { data: targetHistory } = useQuery({
    queryKey: ['handicap-history', targetId],
    queryFn: () => getUserHandicapHistory(targetId),
  })

  if (!viewerHistory || !targetHistory || viewerHistory.length < 3 || targetHistory.length < 3) return null

  // Merge both histories into a single dataset by date
  const allPoints = new Map<string, { date: string; viewer?: number; target?: number }>()
  for (const p of viewerHistory) {
    const key = p.date.slice(0, 10)
    allPoints.set(key, { ...allPoints.get(key), date: key, viewer: p.handicapIndex })
  }
  for (const p of targetHistory) {
    const key = p.date.slice(0, 10)
    allPoints.set(key, { ...allPoints.get(key), date: key, target: p.handicapIndex })
  }
  const data = [...allPoints.values()].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <Card elevation={1} sx={{ mb: 3, borderRadius: 2 }}>
      <CardContent>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2, textTransform: 'uppercase', letterSpacing: 1, color: 'text.secondary' }}>
          Handicap Trends
        </Typography>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
            <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="viewer" name={viewerName.split(' ')[0]} stroke="#2d5e42" strokeWidth={2} dot={false} connectNulls />
            <Line type="monotone" dataKey="target" name={targetName.split(' ')[0]} stroke="#c9a84c" strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function RecentRoundsSection({ rounds }: { rounds: UserProfile['recentRounds'] }) {
  if (rounds.length === 0) return null

  return (
    <Card elevation={1} sx={{ mb: 3, borderRadius: 2 }}>
      <CardContent>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, textTransform: 'uppercase', letterSpacing: 1, color: 'text.secondary' }}>
          Recent Rounds
        </Typography>
        {rounds.map((r) => (
          <Box
            key={r.roundId}
            component={r.shareId ? Link : 'div'}
            {...(r.shareId ? { to: `/scorecard/${r.shareId}` } : {})}
            sx={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              py: 1, borderBottom: '1px solid', borderColor: 'divider',
              textDecoration: 'none', color: 'inherit',
              '&:last-child': { borderBottom: 'none' },
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{formatCourseName(r.courseName)}</Typography>
              <Typography variant="caption" color="text.secondary">{timeAgo(r.playedAt)}</Typography>
            </Box>
            <Box sx={{ textAlign: 'right', ml: 1, flexShrink: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{r.totalStrokes}</Typography>
              <Typography variant="caption" sx={{ color: r.scoreToPar < 0 ? '#c9a84c' : r.scoreToPar === 0 ? '#2d5e42' : '#1a3a5c', fontWeight: 600 }}>
                {scoreLabel(r.scoreToPar)}
              </Typography>
            </Box>
          </Box>
        ))}
      </CardContent>
    </Card>
  )
}

function EditNameDialog({ open, currentName, onClose, onSave }: {
  open: boolean; currentName: string; onClose: () => void; onSave: (name: string) => void
}) {
  const [name, setName] = useState(currentName)
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Edit Name</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth autoFocus value={name}
          onChange={(e) => setName(e.target.value)}
          sx={{ mt: 1 }}
          slotProps={{ htmlInput: { maxLength: 50 } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSave(name.trim())} disabled={!name.trim()} variant="contained">Save</Button>
      </DialogActions>
    </Dialog>
  )
}

export default function ProfilePage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const queryClient = useQueryClient()

  const isOwn = userId === 'me' || userId === user?.id
  const targetId = isOwn ? parseInt(user?.id ?? '0', 10) : parseInt(userId ?? '0', 10)

  const [editOpen, setEditOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [blockOpen, setBlockOpen] = useState(false)

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['profile', targetId],
    queryFn: () => getUserProfile(targetId),
    enabled: targetId > 0,
  })

  const { data: h2h } = useQuery({
    queryKey: ['h2h', targetId],
    queryFn: () => getHeadToHead(targetId),
    enabled: targetId > 0 && !isOwn,
  })

  const updateMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['profile', targetId] })
      // Update auth context user name
      const stored = localStorage.getItem('user')
      if (stored) {
        const u = JSON.parse(stored)
        u.name = data.name
        localStorage.setItem('user', JSON.stringify(u))
      }
      setEditOpen(false)
    },
  })

  const removeMutation = useMutation({
    mutationFn: () => {
      // Need to find friendshipId — we'll get it from the friends list
      return removeFriend(String(targetId))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      navigate('/friends')
    },
  })

  const blockMutation = useMutation({
    mutationFn: () => blockUser(targetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      navigate('/friends')
    },
  })

  if (isLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
  }

  if (error || !profile) {
    return (
      <Box sx={{ maxWidth: 600, mx: 'auto', px: 2, py: 3 }}>
        <PageHeader title="Profile" />
        <Alert severity="error">
          {(error as any)?.response?.status === 403
            ? 'You must be friends with this person to view their profile.'
            : 'Failed to load profile.'}
        </Alert>
      </Box>
    )
  }

  const viewerName = user?.name ?? 'You'

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', px: 2, py: 3 }}>
      <PageHeader title={isOwn ? 'My Profile' : 'Profile'} />

      <ProfileHeader profile={profile} isOwn={isOwn} onEdit={() => setEditOpen(true)} />
      <StatsRow profile={profile} />

      {/* Head-to-head (friends only) */}
      {!isOwn && h2h && (
        <HeadToHeadSection h2h={h2h} viewerName={viewerName} targetName={profile.name} targetId={targetId} />
      )}

      {/* Handicap comparison chart */}
      {!isOwn && user && (
        <HandicapChart
          viewerId={parseInt(user.id, 10)}
          targetId={targetId}
          viewerName={viewerName}
          targetName={profile.name}
        />
      )}

      {/* Own profile: handicap chart just for self */}
      {isOwn && user && (
        <OwnHandicapChart userId={parseInt(user.id, 10)} />
      )}

      <RecentRoundsSection rounds={profile.recentRounds} />

      {profile.favouriteCourse && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mb: 2 }}>
          <GolfCourseIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} />
          Favourite course: {formatCourseName(profile.favouriteCourse)}
        </Typography>
      )}

      {/* Action buttons for friend profiles */}
      {!isOwn && (
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mt: 2, mb: 2 }}>
          <Button
            variant="contained"
            size="small"
            onClick={() => navigate(`/teetimes?invite=${targetId}`)}
            sx={{ textTransform: 'none' }}
          >
            Challenge
          </Button>
          <Button
            variant="outlined"
            color="error"
            size="small"
            startIcon={<PersonRemoveIcon />}
            onClick={() => setRemoveOpen(true)}
            sx={{ textTransform: 'none' }}
          >
            Remove
          </Button>
          <Button
            variant="outlined"
            color="error"
            size="small"
            startIcon={<BlockIcon />}
            onClick={() => setBlockOpen(true)}
            sx={{ textTransform: 'none' }}
          >
            Block
          </Button>
        </Box>
      )}

      {/* Edit name dialog */}
      <EditNameDialog
        open={editOpen}
        currentName={profile.name}
        onClose={() => setEditOpen(false)}
        onSave={(name) => updateMutation.mutate({ name })}
      />

      {/* Remove friend confirmation */}
      <Dialog open={removeOpen} onClose={() => setRemoveOpen(false)}>
        <DialogTitle>Remove Friend</DialogTitle>
        <DialogContent>
          <Typography>Remove {profile.name} from your friends?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveOpen(false)}>Cancel</Button>
          <Button color="error" onClick={() => removeMutation.mutate()} disabled={removeMutation.isPending}>
            Remove
          </Button>
        </DialogActions>
      </Dialog>

      {/* Block confirmation */}
      <Dialog open={blockOpen} onClose={() => setBlockOpen(false)}>
        <DialogTitle>Block User</DialogTitle>
        <DialogContent>
          <Typography>
            Block {profile.name}? They won't be able to see your rounds, send you friend requests, or interact with you.
            You will also be removed from each other's friends list.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBlockOpen(false)}>Cancel</Button>
          <Button color="error" onClick={() => blockMutation.mutate()} disabled={blockMutation.isPending}>
            Block
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

function OwnHandicapChart({ userId }: { userId: number }) {
  const { data: history } = useQuery({
    queryKey: ['handicap-history', userId],
    queryFn: () => getUserHandicapHistory(userId),
  })

  if (!history || history.length < 3) return null

  return (
    <Card elevation={1} sx={{ mb: 3, borderRadius: 2 }}>
      <CardContent>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2, textTransform: 'uppercase', letterSpacing: 1, color: 'text.secondary' }}>
          Handicap Trend
        </Typography>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={history}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5, 10)} />
            <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
            <Tooltip />
            <Line type="monotone" dataKey="handicapIndex" name="Handicap" stroke="#2d5e42" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
