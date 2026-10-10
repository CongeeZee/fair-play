import { useState, useRef, useCallback, type ReactNode } from 'react'
import {
  Box, Typography, Tabs, Tab, List, ListItem, ListItemButton, ListItemAvatar, ListItemText, Paper,
  Button, TextField, InputAdornment, CircularProgress, Alert, Chip,
} from '@mui/material'
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1'
import LinkIcon from '@mui/icons-material/Link'
import SearchIcon from '@mui/icons-material/Search'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import GroupAddIcon from '@mui/icons-material/GroupAdd'
import MarkEmailUnreadIcon from '@mui/icons-material/MarkEmailUnread'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getFriends, getFriendRequests, searchUsers, getFriendSuggestions,
  sendFriendRequest, acceptFriendRequest, declineFriendRequest,
} from '../api/friends'
import { getLiveRounds } from '../api/live'
import { useNavigate, useSearchParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import UserAvatar from '../components/UserAvatar'
import InviteFriendsDialog from '../components/InviteFriendsDialog'
import LeaderboardSection from '../components/LeaderboardSection'
import { capture, AnalyticsEvent } from '../analytics'
import EmptyState from '../components/EmptyState'
import { useAuth } from '../contexts/AuthContext'
import { resendVerification } from '../api/auth'
import { CLAY, tint } from '../theme'
import { getApiErrorMessage } from '../api/errorMessage'
import { formatHandicap, formatCourseName } from '../utils'

/** One card holding a list, rows separated by the card hairline. */
function ListCard({ children }: { children: ReactNode }) {
  return (
    <Paper elevation={0} sx={{ overflow: 'hidden' }}>
      <List disablePadding sx={{ '& > * + *': { borderTop: '1px solid var(--c-borderC)' } }}>{children}</List>
    </Paper>
  )
}

function QueryError({ error, fallback }: { error: unknown; fallback: string }) {
  return <Alert severity="error" sx={{ my: 2 }}>{getApiErrorMessage(error, fallback)}</Alert>
}

function Loading() {
  return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box>
}

function FriendsTab({ onInvite, onFindFriends }: { onInvite: () => void; onFindFriends: () => void }) {
  const navigate = useNavigate()
  const { data: friends, isLoading, isError, error } = useQuery({ queryKey: ['friends'], queryFn: getFriends })
  const { data: liveData } = useQuery({ queryKey: ['live-rounds'], queryFn: getLiveRounds })

  const liveById = new Map((liveData?.liveRounds ?? []).map((r) => [r.playerId, r]))

  if (isLoading) return <Loading />
  // Errors used to fall through to the empty state, which made a server
  // failure look like "you have no friends".
  if (isError) return <QueryError error={error} fallback="Couldn't load your friends. Please try again." />

  if (!friends?.length) {
    return (
      <EmptyState
        icon={<GroupAddIcon sx={{ fontSize: 36 }} />}
        title="Bring your golf mates along"
        description="Share an invite link with your group — anyone who joins gets connected to you automatically."
        primary={{ label: 'Invite with a link', onClick: onInvite, icon: <LinkIcon /> }}
        secondary={{ label: 'Find by name', onClick: onFindFriends }}
      />
    )
  }

  // Live players first, then alphabetical
  const sorted = [...friends].sort((a, b) =>
    Number(liveById.has(b.id)) - Number(liveById.has(a.id)) || a.name.localeCompare(b.name))

  return (
    <>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, px: 0.5 }}>
        {friends.length} friend{friends.length === 1 ? '' : 's'}
      </Typography>
      <ListCard>
        {sorted.map((f) => {
          const live = liveById.get(f.id)
          return (
            <ListItemButton key={f.friendshipId} onClick={() => navigate(`/profile/${f.id}`)} sx={{ borderRadius: 0, py: 1.25 }}>
              <ListItemAvatar>
                <UserAvatar userId={f.id} name={f.name} size={42} link={false} />
              </ListItemAvatar>
              <ListItemText
                primary={f.name}
                primaryTypographyProps={{ fontWeight: 600 }}
                secondary={live
                  ? `On the course · ${formatCourseName(live.courseName)} · thru ${live.holesCompleted}`
                  : f.handicapIndex != null ? `Handicap ${formatHandicap(f.handicapIndex)}` : 'No handicap yet'}
                secondaryTypographyProps={{ noWrap: true, sx: live ? { color: CLAY.successText, fontWeight: 600 } : undefined }}
              />
              {live ? (
                <Chip
                  label="Watch"
                  size="small"
                  onClick={(e) => { e.stopPropagation(); navigate(`/live/${live.roundId}`) }}
                  sx={{ bgcolor: tint(CLAY.green, 0.14), color: CLAY.greenText, fontWeight: 700 }}
                />
              ) : (
                <ChevronRightIcon sx={{ color: 'text.secondary' }} />
              )}
            </ListItemButton>
          )
        })}
      </ListCard>
    </>
  )
}

function RequestsTab() {
  const queryClient = useQueryClient()
  const { data: requests, isLoading, isError, error } = useQuery({ queryKey: ['friend-requests'], queryFn: getFriendRequests })

  const done = () => {
    queryClient.invalidateQueries({ queryKey: ['friend-requests'] })
    queryClient.invalidateQueries({ queryKey: ['friends'] })
    queryClient.invalidateQueries({ queryKey: ['friend-suggestions'] })
  }
  const acceptMutation = useMutation({
    mutationFn: acceptFriendRequest,
    onSuccess: () => { capture(AnalyticsEvent.FriendAdded, {}); done() },
  })
  const declineMutation = useMutation({ mutationFn: declineFriendRequest, onSuccess: done })

  if (isLoading) return <Loading />
  if (isError) return <QueryError error={error} fallback="Couldn't load friend requests. Please try again." />
  if (!requests?.length) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography color="text.secondary">No pending requests right now.</Typography>
      </Box>
    )
  }

  return (
    <ListCard>
      {requests.map((r) => (
        <ListItem key={r.friendshipId} sx={{ py: 1.5, flexWrap: 'wrap', gap: 1 }}>
          <ListItemAvatar>
            <UserAvatar userId={r.from.id} name={r.from.name} size={42} />
          </ListItemAvatar>
          <ListItemText
            primary={r.from.name}
            primaryTypographyProps={{ fontWeight: 600 }}
            secondary={`Sent ${new Date(r.sentAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
            sx={{ flex: '1 1 140px' }}
          />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" variant="contained" onClick={() => acceptMutation.mutate(r.friendshipId)} disabled={acceptMutation.isPending}>
              Accept
            </Button>
            <Button size="small" onClick={() => declineMutation.mutate(r.friendshipId)} disabled={declineMutation.isPending} sx={{ color: 'text.secondary' }}>
              Decline
            </Button>
          </Box>
        </ListItem>
      ))}
    </ListCard>
  )
}

function FindFriendsTab({ onInvite }: { onInvite: () => void }) {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [sentTo, setSentTo] = useState<Set<number>>(new Set())
  // A ref, not state, for the timer: state re-rendered on every keystroke
  // just to remember the handle.
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleChange = useCallback((value: string) => {
    setQuery(value)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => setDebouncedQuery(value.trim()), 300)
  }, [])

  const searching = debouncedQuery.length >= 2
  const { data: results, isLoading, isError, error } = useQuery({
    queryKey: ['friend-search', debouncedQuery],
    queryFn: () => searchUsers(debouncedQuery),
    enabled: searching,
  })
  const { data: suggestions } = useQuery({
    queryKey: ['friend-suggestions'],
    queryFn: getFriendSuggestions,
    enabled: !searching,
    staleTime: 5 * 60_000,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['friend-search'] })
    queryClient.invalidateQueries({ queryKey: ['friend-requests'] })
    queryClient.invalidateQueries({ queryKey: ['friends'] })
  }
  const addMutation = useMutation({
    mutationFn: sendFriendRequest,
    onSuccess: (_d, id) => { setSentTo((s) => new Set(s).add(id)); refresh() },
  })
  const acceptMutation = useMutation({
    mutationFn: acceptFriendRequest,
    onSuccess: () => { capture(AnalyticsEvent.FriendAdded, {}); refresh() },
  })

  const addButton = (id: number) => sentTo.has(id)
    ? <Chip label="Request sent" size="small" variant="outlined" />
    : (
      <Button size="small" variant="outlined" startIcon={<PersonAddAlt1Icon />} onClick={() => addMutation.mutate(id)} disabled={addMutation.isPending}>
        Add
      </Button>
    )

  return (
    <Box>
      <Paper elevation={0} sx={{ p: 2, mb: 2, display: 'flex', alignItems: 'center', gap: 1.5, bgcolor: tint(CLAY.green, 0.06) }}>
        <LinkIcon sx={{ color: CLAY.greenText }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700 }}>Invite your group</Typography>
          <Typography variant="body2" color="text.secondary">Anyone who joins with your link is added as a friend.</Typography>
        </Box>
        <Button variant="contained" size="small" onClick={onInvite}>Share link</Button>
      </Paper>

      <TextField
        fullWidth
        placeholder="Search by name or exact email…"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        sx={{ mb: 2 }}
        slotProps={{
          input: { startAdornment: <InputAdornment position="start"><SearchIcon color="action" /></InputAdornment> },
          htmlInput: { 'aria-label': 'Search for golfers', autoCapitalize: 'none', autoCorrect: 'off' },
        }}
      />

      {addMutation.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>{getApiErrorMessage(addMutation.error, 'Failed to send request')}</Alert>
      )}
      {isError && <QueryError error={error} fallback="Search failed. Please try again." />}
      {searching && isLoading && <Loading />}

      {searching && results && results.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="text.secondary" sx={{ mb: 0.5 }}>No golfers found for "{debouncedQuery}"</Typography>
          <Typography variant="caption" color="text.secondary">
            Only verified accounts show up. If they haven't joined yet, send them your invite link.
          </Typography>
        </Box>
      )}

      {searching && results && results.length > 0 && (
        <ListCard>
          {results.map((u) => (
            <ListItem key={u.id} sx={{ py: 1.25 }}>
              <ListItemAvatar><UserAvatar userId={u.id} name={u.name} size={40} link={u.isFriend} /></ListItemAvatar>
              <ListItemText primary={u.name} primaryTypographyProps={{ fontWeight: 600 }} />
              {u.isFriend ? (
                <Chip label="Friends" size="small" sx={{ bgcolor: tint(CLAY.green, 0.14), color: CLAY.greenText, fontWeight: 700 }} />
              ) : u.incomingRequestId ? (
                <Button size="small" variant="contained" onClick={() => acceptMutation.mutate(u.incomingRequestId!)} disabled={acceptMutation.isPending}>
                  Accept
                </Button>
              ) : u.isPending ? (
                <Chip label="Request sent" size="small" variant="outlined" />
              ) : addButton(u.id)}
            </ListItem>
          ))}
        </ListCard>
      )}

      {!searching && suggestions && suggestions.length > 0 && (
        <>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 0.75, px: 0.5 }}>
            People you may know
          </Typography>
          <ListCard>
            {suggestions.map((s) => (
              <ListItem key={s.id} sx={{ py: 1.25 }}>
                <ListItemAvatar><UserAvatar userId={s.id} name={s.name} size={40} link={false} /></ListItemAvatar>
                <ListItemText
                  primary={s.name}
                  primaryTypographyProps={{ fontWeight: 600 }}
                  secondary={[
                    s.playedWith ? 'Played a round with you' : null,
                    s.mutualFriends > 0 ? `${s.mutualFriends} mutual friend${s.mutualFriends === 1 ? '' : 's'}` : null,
                  ].filter(Boolean).join(' · ')}
                />
                {addButton(s.id)}
              </ListItem>
            ))}
          </ListCard>
        </>
      )}
    </Box>
  )
}

const TABS = ['friends', 'leaderboard', 'requests', 'add'] as const
type TabKey = (typeof TABS)[number]

export default function FriendsPage() {
  // ?tab=requests deep-links from a friend-request notification
  const [params, setParams] = useSearchParams()
  const fromUrl = params.get('tab')
  const tab: TabKey = fromUrl === 'find' ? 'add' : (TABS as readonly string[]).includes(fromUrl ?? '') ? (fromUrl as TabKey) : 'friends'
  const setTab = (t: TabKey) => setParams(t === 'friends' ? {} : { tab: t }, { replace: true })
  const [inviteOpen, setInviteOpen] = useState(false)
  const { user } = useAuth()
  // Every /friends endpoint returns 403 until the email is verified, so don't
  // fire requests that are guaranteed to fail.
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
      <Box sx={{ maxWidth: 640, mx: 'auto', px: 2, pb: 3 }}>
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
          <Alert severity="error" sx={{ mt: 2 }}>Couldn't resend the verification email. Please try again in a moment.</Alert>
        )}
      </Box>
    )
  }

  return (
    <Box sx={{ maxWidth: 640, mx: 'auto', px: 2, pb: 3 }}>
      <PageHeader
        title="Friends"
        action={tab === 'add'
          ? <Button size="small" onClick={() => setTab('friends')}>Done</Button>
          : <Button variant="contained" size="small" startIcon={<PersonAddAlt1Icon />} onClick={() => setTab('add')}>Add friends</Button>}
      />

      <InviteFriendsDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />

      {/* "Add" is reached from the header button, not a fourth tab — four
          didn't fit at phone width and duplicated the button anyway. */}
      <Tabs value={tab === 'add' ? false : tab} onChange={(_, v: TabKey) => setTab(v)} variant="fullWidth" sx={{ mb: 2.5 }}>
        <Tab value="friends" label="Friends" />
        <Tab value="leaderboard" label="Ranks" />
        <Tab value="requests" label={
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
            Requests
            {pendingCount > 0 && (
              <Box component="span" sx={{ minWidth: 20, height: 20, px: 0.5, borderRadius: 999, bgcolor: 'error.main', color: 'error.contrastText', fontSize: '0.72rem', fontWeight: 700, display: 'grid', placeItems: 'center' }}>
                {pendingCount}
              </Box>
            )}
          </Box>
        } />
      </Tabs>

      {tab === 'friends' && <FriendsTab onInvite={() => setInviteOpen(true)} onFindFriends={() => setTab('add')} />}
      {tab === 'leaderboard' && <LeaderboardSection />}
      {tab === 'requests' && <RequestsTab />}
      {tab === 'add' && <FindFriendsTab onInvite={() => setInviteOpen(true)} />}
    </Box>
  )
}
