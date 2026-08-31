import { useState, useRef, useCallback } from 'react'
import {
  Box, Typography, Tabs, Tab, Badge, List, ListItem, ListItemText, Paper,
  IconButton, Button, TextField, InputAdornment, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert, Chip,
} from '@mui/material'
import PersonRemoveIcon from '@mui/icons-material/PersonRemove'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import LinkIcon from '@mui/icons-material/Link'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import SearchIcon from '@mui/icons-material/Search'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getFriends, getFriendRequests, searchUsers,
  sendFriendRequest, acceptFriendRequest, declineFriendRequest, removeFriend,
} from '../api/friends'
import { getLiveRounds } from '../api/live'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import ProfileLink from '../components/ProfileLink'
import InviteFriendsDialog from '../components/InviteFriendsDialog'
import { capture, AnalyticsEvent } from '../analytics'
import EmptyState from '../components/EmptyState'
import GroupAddIcon from '@mui/icons-material/GroupAdd'
import MarkEmailUnreadIcon from '@mui/icons-material/MarkEmailUnread'
import { useAuth } from '../contexts/AuthContext'
import { resendVerification } from '../api/auth'
import { CLAY } from '../theme'
import { getApiErrorMessage } from '../api/errorMessage'
import { formatHandicap } from '../utils'

/**
 * Shared shell for the three tab lists.
 *
 * All three used to render their rows bare on the clay page background with
 * full-width hairline `divider`s — the last place in the app that still read as
 * flat Material next to the raised cards on every other page. The rows now sit
 * inside one raised clay card — the same Paper + List shape the History page
 * already uses — and the separators are the theme's warm clay seam rather than
 * a full-bleed rule running to the page edge.
 */
const listCardSx = {
  borderRadius: 2.4,
  overflow: 'hidden',
  '& .MuiListItem-root': { py: 1.5, px: 2 },
  '& .MuiListItem-root + .MuiListItem-root': {
    borderTop: '1px solid',
    borderColor: 'divider',
  },
} as const

/** Extract a human-readable message from an axios error. */
const apiError = (err: unknown, fallback: string) => getApiErrorMessage(err, fallback)

/** Shared inline error state for the three tab queries. */
function QueryError({ error, fallback }: { error: unknown; fallback: string }) {
  return (
    <Alert severity="error" sx={{ my: 2 }}>
      {apiError(error, fallback)}
    </Alert>
  )
}

function FriendsTab({ onInvite, onFindFriends }: { onInvite: () => void; onFindFriends: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: friends, isLoading, isError, error } = useQuery({ queryKey: ['friends'], queryFn: getFriends })
  const { data: liveData } = useQuery({ queryKey: ['live-rounds'], queryFn: getLiveRounds })
  const [removeTarget, setRemoveTarget] = useState<{ friendshipId: string; name: string } | null>(null)

  // Map friend names to live rounds for badge display
  const liveByName = new Map<string, { roundId: number; courseName: string }>()
  for (const r of liveData?.liveRounds ?? []) {
    liveByName.set(r.playerName, { roundId: r.roundId, courseName: r.courseName })
  }

  const removeMutation = useMutation({
    mutationFn: removeFriend,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      setRemoveTarget(null)
    },
  })

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box>

  // Previously errors fell through to the empty state, which made server
  // failures look like "you have no friends". Surface them explicitly.
  if (isError) return <QueryError error={error} fallback="Couldn't load your friends. Please try again." />

  if (!friends?.length) {
    return (
      <EmptyState
        icon={<GroupAddIcon sx={{ fontSize: 36 }} />}
        title="Bring your golf mates along"
        description="Share an invite link with your group — anyone who joins gets auto-connected to everyone else."
        primary={{ label: 'Invite with a link', onClick: onInvite, icon: <LinkIcon /> }}
        secondary={{ label: 'Find by name', onClick: onFindFriends }}
      />
    )
  }

  return (
    <>
      <Paper elevation={2} sx={listCardSx}>
        <List disablePadding>
          {friends.map((f) => {
            const live = liveByName.get(f.name)
            return (
              <ListItem
                key={f.friendshipId}
                secondaryAction={
                  <IconButton aria-label={`Remove ${f.name} as a friend`} edge="end" onClick={() => setRemoveTarget({ friendshipId: f.friendshipId, name: f.name })} size="small">
                    <PersonRemoveIcon fontSize="small" />
                  </IconButton>
                }
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <ProfileLink userId={f.id} name={f.name} variant="body1" />
                      {live && (
                        <Chip
                          label={`Playing`}
                          size="small"
                          onClick={(e) => { e.stopPropagation(); navigate(`/live/${live.roundId}`) }}
                          sx={{
                            height: 20, fontSize: '0.6rem', fontWeight: 700,
                            bgcolor: 'rgba(99,180,127,0.15)', color: CLAY.greenDark,
                            cursor: 'pointer',
                          }}
                        />
                      )}
                    </Box>
                  }
                  secondary={live ? live.courseName.replace(/\s*—.*$/, '') : (f.handicapIndex != null ? `Handicap: ${formatHandicap(f.handicapIndex)}` : 'No handicap')}
                />
              </ListItem>
            )
          })}
        </List>
      </Paper>

      <Dialog open={!!removeTarget} onClose={() => setRemoveTarget(null)}>
        <DialogTitle>Remove Friend</DialogTitle>
        <DialogContent>
          <Typography>Remove {removeTarget?.name} from your friends?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveTarget(null)}>Cancel</Button>
          <Button
            color="error"
            onClick={() => removeTarget && removeMutation.mutate(removeTarget.friendshipId)}
            disabled={removeMutation.isPending}
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

function RequestsTab() {
  const queryClient = useQueryClient()
  const { data: requests, isLoading, isError, error } = useQuery({ queryKey: ['friend-requests'], queryFn: getFriendRequests })

  const acceptMutation = useMutation({
    mutationFn: acceptFriendRequest,
    onSuccess: () => {
      capture(AnalyticsEvent.FriendAdded, {})
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] })
      queryClient.invalidateQueries({ queryKey: ['friends'] })
    },
  })

  const declineMutation = useMutation({
    mutationFn: declineFriendRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] })
    },
  })

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box>

  if (isError) return <QueryError error={error} fallback="Couldn't load friend requests. Please try again." />

  if (!requests?.length) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography color="text.secondary">No pending requests right now.</Typography>
      </Box>
    )
  }

  return (
    <Paper elevation={2} sx={listCardSx}>
      <List disablePadding>
        {requests.map((r) => (
          <ListItem
            key={r.friendshipId}
            secondaryAction={
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <IconButton aria-label={`Accept friend request from ${r.from.name}`}
                  color="primary"
                  onClick={() => acceptMutation.mutate(r.friendshipId)}
                  disabled={acceptMutation.isPending}
                  size="small"
                >
                  <CheckIcon />
                </IconButton>
                <IconButton aria-label={`Decline friend request from ${r.from.name}`}
                  onClick={() => declineMutation.mutate(r.friendshipId)}
                  disabled={declineMutation.isPending}
                  size="small"
                >
                  <CloseIcon />
                </IconButton>
              </Box>
            }
          >
            <ListItemText
              primary={<ProfileLink userId={r.from.id} name={r.from.name} variant="body1" />}
              secondary={`Sent ${new Date(r.sentAt).toLocaleDateString()}`}
            />
          </ListItem>
        ))}
      </List>
    </Paper>
  )
}

function FindFriendsTab() {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  // useRef (not useState) for the timer: storing it in state caused a re-render
  // per keystroke just to remember the handle, and the stale-closure cleanup
  // could let two timers race.
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleChange = useCallback((value: string) => {
    setQuery(value)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => setDebouncedQuery(value), 300)
  }, [])

  const { data: results, isLoading, isError, error } = useQuery({
    queryKey: ['friend-search', debouncedQuery],
    queryFn: () => searchUsers(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
  })

  const addMutation = useMutation({
    mutationFn: sendFriendRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friend-search'] })
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] })
    },
  })

  return (
    <Box>
      <TextField
        fullWidth
        placeholder="Search by name..."
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        size="small"
        sx={{ mb: 2 }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
          },
        }}
      />

      {addMutation.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {apiError(addMutation.error, 'Failed to send request')}
        </Alert>
      )}

      {/* Search failures used to render as nothing at all — the #1 cause of
          "friend search doesn't work" reports. Show the server's message. */}
      {isError && <QueryError error={error} fallback="Search failed. Please try again." />}

      {isLoading && debouncedQuery.length >= 2 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box>
      )}

      {results && results.length === 0 && debouncedQuery.length >= 2 && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="text.secondary">
            No users found matching "{debouncedQuery}"
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Search matches names of verified accounts only — if your friend just
            signed up, ask them to verify their email, or send them an invite link.
          </Typography>
        </Box>
      )}

      {results && results.length > 0 && (
        <Paper elevation={2} sx={listCardSx}>
          <List disablePadding>
            {results.map((u) => (
              <ListItem key={u.id} secondaryAction={
                u.isFriend ? (
                  <Chip label="Friends" size="small" color="success" variant="outlined" />
                ) : u.isPending ? (
                  <Chip label="Pending" size="small" variant="outlined" />
                ) : (
                  <IconButton aria-label={`Add ${u.name} as a friend`}
                    color="primary"
                    onClick={() => addMutation.mutate(u.id)}
                    disabled={addMutation.isPending}
                    size="small"
                  >
                    <PersonAddIcon />
                  </IconButton>
                )
              }>
                <ListItemText primary={u.name} />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}
    </Box>
  )
}

export default function FriendsPage() {
  const [tab, setTab] = useState(0)
  const [inviteOpen, setInviteOpen] = useState(false)
  const { user } = useAuth()
  // Every /friends endpoint returns 403 until the email is verified, so don't
  // fire requests that are guaranteed to fail — and tell the user why the page
  // is locked instead of showing misleading empty tabs.
  const emailVerified = user?.emailVerified !== false
  const { data: requests } = useQuery({
    queryKey: ['friend-requests'],
    queryFn: getFriendRequests,
    enabled: emailVerified,
  })

  const pendingCount = requests?.length ?? 0

  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const handleResend = async () => {
    setResendState('sending')
    try {
      await resendVerification()
      setResendState('sent')
    } catch {
      setResendState('error')
    }
  }

  if (!emailVerified) {
    return (
      <Box sx={{ maxWidth: 600, mx: 'auto', px: 2, py: 3 }}>
        <PageHeader title="Friends" />
        <EmptyState
          icon={<MarkEmailUnreadIcon sx={{ fontSize: 36 }} />}
          title="Verify your email to unlock social features"
          description={`Friends, requests and search open up once you've verified ${user?.email ?? 'your email address'}. Check your inbox for the verification link.`}
          primary={{
            label: resendState === 'sent' ? 'Email sent — check your inbox' : 'Resend verification email',
            onClick: handleResend,
          }}
        />
        {resendState === 'error' && (
          <Alert severity="error" sx={{ mt: 2 }}>
            Couldn't resend the verification email. Please try again in a moment.
          </Alert>
        )}
      </Box>
    )
  }

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', px: 2, py: 3 }}>
      <PageHeader title="Friends" />

      <Box sx={{ mb: 2 }}>
        <Button
          variant="outlined"
          startIcon={<LinkIcon />}
          fullWidth
          onClick={() => setInviteOpen(true)}
        >
          Invite friends with a link
        </Button>
      </Box>

      <InviteFriendsDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="fullWidth"
        sx={{ mb: 3 }}
      >
        <Tab label="Friends" />
        <Tab label={
          pendingCount > 0
            ? <Badge badgeContent={pendingCount} color="error" sx={{ '& .MuiBadge-badge': { right: -12, top: 2 } }}>Requests</Badge>
            : 'Requests'
        } />
        <Tab label="Find Friends" />
      </Tabs>

      {tab === 0 && <FriendsTab onInvite={() => setInviteOpen(true)} onFindFriends={() => setTab(2)} />}
      {tab === 1 && <RequestsTab />}
      {tab === 2 && <FindFriendsTab />}
    </Box>
  )
}
