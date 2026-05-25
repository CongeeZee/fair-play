import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Box, Typography, Card, CardContent, Chip, Button,
  CircularProgress, IconButton, Snackbar, Dialog, DialogTitle,
  DialogContent, Switch, FormControlLabel, CardActions, TextField,
  InputAdornment,
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import ShareIcon from '@mui/icons-material/Share'
import SendIcon from '@mui/icons-material/Send'
import PeopleIcon from '@mui/icons-material/People'
import VisibilityIcon from '@mui/icons-material/Visibility'
import SettingsIcon from '@mui/icons-material/Settings'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import CloseIcon from '@mui/icons-material/Close'
import { Link, useNavigate } from 'react-router-dom'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getFeed } from '../api/rounds'
import { joinTeeTime } from '../api/teetimes'
import { addComment } from '../api/reactions'
import { formatCourseName, timeAgo } from '../utils'
import type { FeedRound, FeedTeeTime, OwnLatestRound, RecentComment } from '../types'
import PageHeader from '../components/PageHeader'
import ReactionBar from '../components/ReactionBar'
import { usePushNotifications } from '../hooks/usePushNotifications'

function scoreColor(scoreToPar: number) {
  if (scoreToPar < 0) return '#c9a84c'
  if (scoreToPar === 0) return '#2d5e42'
  if (scoreToPar <= 5) return '#1a3a5c'
  return '#c62828'
}

function scoreLabel(scoreToPar: number) {
  if (scoreToPar === 0) return 'E'
  return scoreToPar > 0 ? `+${scoreToPar}` : `${scoreToPar}`
}

function InlineComments({ roundId, shareId, commentCount, recentComments }: {
  roundId: number
  shareId: string | null
  commentCount: number
  recentComments: RecentComment[]
}) {
  const [showInput, setShowInput] = useState(false)
  const [text, setText] = useState('')
  const queryClient = useQueryClient()
  const [optimisticComments, setOptimisticComments] = useState<RecentComment[]>(recentComments)
  const [optimisticCount, setOptimisticCount] = useState(commentCount)

  // Sync with props when they change
  const prevKey = useRef(`${roundId}-${commentCount}`)
  const key = `${roundId}-${commentCount}`
  if (key !== prevKey.current) {
    prevKey.current = key
    setOptimisticComments(recentComments)
    setOptimisticCount(commentCount)
  }

  const commentMutation = useMutation({
    mutationFn: () => addComment(roundId, text.trim()),
    onSuccess: (data) => {
      setOptimisticComments((prev) => [...prev.slice(-1), { name: data.userName, text: data.text }])
      setOptimisticCount((c) => c + 1)
      setText('')
      setShowInput(false)
      queryClient.invalidateQueries({ queryKey: ['feed'] })
    },
  })

  return (
    <Box>
      {optimisticComments.map((c, i) => (
        <Typography key={i} variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.25 }} noWrap>
          <Typography component="span" variant="caption" sx={{ fontWeight: 700, color: 'text.primary' }}>
            {c.name}
          </Typography>{' '}
          {c.text}
        </Typography>
      ))}

      {optimisticCount > 2 && shareId && (
        <Typography
          component={Link}
          to={`/scorecard/${shareId}`}
          variant="caption"
          sx={{ color: 'text.secondary', textDecoration: 'none', '&:hover': { textDecoration: 'underline' }, display: 'block', mt: 0.25 }}
        >
          View all {optimisticCount} comments
        </Typography>
      )}

      {!showInput ? (
        <Typography
          variant="caption"
          onClick={() => setShowInput(true)}
          sx={{ color: 'text.disabled', cursor: 'pointer', display: 'block', mt: 0.5 }}
        >
          Add a comment...
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, alignItems: 'center' }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Write a comment..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) commentMutation.mutate() }}
            autoFocus
            slotProps={{ input: { sx: { fontSize: '0.8rem', py: 0.5 } } }}
          />
          <IconButton
            size="small"
            onClick={() => commentMutation.mutate()}
            disabled={!text.trim() || commentMutation.isPending}
            color="primary"
          >
            <SendIcon fontSize="small" />
          </IconButton>
        </Box>
      )}
    </Box>
  )
}

function OwnRoundCard({ round }: { round: OwnLatestRound }) {
  const [snackbar, setSnackbar] = useState(false)

  const handleShare = async () => {
    if (!round.shareId) return
    const url = `${window.location.origin}/scorecard/${round.shareId}`
    const courseName = formatCourseName(round.courseName)
    const scoreStr = round.scoreToPar === 0 ? 'even par' : round.scoreToPar > 0 ? `+${round.scoreToPar}` : `${round.scoreToPar}`
    if (navigator.share) {
      try { await navigator.share({ title: `My round at ${courseName}`, text: `Shot ${round.totalStrokes} (${scoreStr})`, url }) } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(url)
      setSnackbar(true)
    }
  }

  return (
    <>
      <Card elevation={2} sx={{ mb: 3, border: '2px solid', borderColor: 'secondary.main', borderRadius: 2 }}>
        <CardContent sx={{ pb: '12px !important' }}>
          <Typography variant="overline" color="secondary.main" sx={{ fontWeight: 700, letterSpacing: 1 }}>
            Your latest round
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                {formatCourseName(round.courseName)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {timeAgo(round.playedAt)}
                {round.totalHoles < round.courseHoles && ` · ${round.totalHoles} holes`}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ textAlign: 'right' }}>
                <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1 }}>
                  {round.totalStrokes}
                </Typography>
                <Chip
                  label={scoreLabel(round.scoreToPar)}
                  size="small"
                  sx={{ bgcolor: scoreColor(round.scoreToPar), color: '#fff', fontWeight: 700, mt: 0.5, height: 22 }}
                />
              </Box>
              {round.shareId && (
                <IconButton size="small" onClick={handleShare}>
                  <ShareIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          </Box>
          <Box sx={{ mt: 1.5, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
            <ReactionBar
              roundId={round.id}
              reactionSummary={round.reactionSummary}
              userReaction={round.userReaction}
            />
            <InlineComments
              roundId={round.id}
              shareId={round.shareId}
              commentCount={round.commentCount}
              recentComments={round.recentComments}
            />
          </Box>
        </CardContent>
      </Card>
      <Snackbar open={snackbar} autoHideDuration={2000} onClose={() => setSnackbar(false)} message="Link copied!" anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} sx={{ mb: { xs: '68px', md: 0 } }} />
    </>
  )
}

function FeedCard({ round }: { round: FeedRound }) {
  return (
    <Card elevation={1} sx={{ mb: 2, borderRadius: 2 }}>
      <CardContent sx={{ pb: '12px !important' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" color="primary.main" sx={{ fontWeight: 700 }}>
              {round.playerName}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.25 }} noWrap>
              {formatCourseName(round.courseName)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {timeAgo(round.playedAt)}
              {round.totalHoles < round.courseHoles && ` · ${round.totalHoles} holes`}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right', ml: 2, flexShrink: 0 }}>
            <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1 }}>
              {round.totalStrokes}
            </Typography>
            <Chip
              label={scoreLabel(round.scoreToPar)}
              size="small"
              sx={{ bgcolor: scoreColor(round.scoreToPar), color: '#fff', fontWeight: 700, mt: 0.5, height: 22 }}
            />
          </Box>
        </Box>
        <Box sx={{ mt: 1.5, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
          <ReactionBar
            roundId={round.id}
            reactionSummary={round.reactionSummary}
            userReaction={round.userReaction}
          />
          <InlineComments
            roundId={round.id}
            shareId={round.shareId}
            commentCount={round.commentCount}
            recentComments={round.recentComments}
          />
          {round.shareId && (
            <Button
              component={Link}
              to={`/scorecard/${round.shareId}`}
              size="small"
              startIcon={<VisibilityIcon />}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem', mt: 0.5 }}
            >
              View Scorecard
            </Button>
          )}
        </Box>
      </CardContent>
    </Card>
  )
}

function feedRelativeDate(dt: string): string {
  const d = new Date(dt)
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  const dayOfWeek = d.toLocaleDateString('en-AU', { weekday: 'long' })
  if (diffDays <= 6) return dayOfWeek
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

function TeeTimeCard({ teeTime }: { teeTime: FeedTeeTime }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const joinMutation = useMutation({
    mutationFn: () => joinTeeTime(teeTime.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      queryClient.invalidateQueries({ queryKey: ['teetimes'] })
    },
  })

  const spotsLeft = teeTime.spotsTotal - teeTime.spotsFilled
  const dateLabel = feedRelativeDate(teeTime.dateTime)
  const timeLabel = new Date(teeTime.dateTime).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })

  return (
    <Card elevation={1} sx={{ mb: 2, borderRadius: 2, border: '1px solid rgba(26,58,42,0.15)' }}>
      <CardContent sx={{ pb: '12px !important' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" color="primary.main" sx={{ fontWeight: 700 }}>
              {teeTime.creatorName}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.25 }}>
              Looking for players{teeTime.courseName ? ` at ${formatCourseName(teeTime.courseName)}` : ''}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {dateLabel} · {timeLabel} · {spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left
            </Typography>
          </Box>
          <Chip label="Tee Time" size="small" sx={{ bgcolor: '#1a3a2a', color: '#fff', fontWeight: 600, fontSize: '0.65rem', height: 22 }} />
        </Box>
      </CardContent>
      <CardActions sx={{ pt: 0, px: 2, pb: 1.5 }}>
        <Button
          size="small"
          variant="contained"
          onClick={() => joinMutation.mutate()}
          disabled={joinMutation.isPending}
          sx={{ textTransform: 'none', mr: 1 }}
        >
          {joinMutation.isPending ? 'Joining...' : 'Join'}
        </Button>
        <Button
          size="small"
          onClick={() => navigate(`/teetimes/${teeTime.id}`)}
          sx={{ textTransform: 'none' }}
        >
          Details
        </Button>
      </CardActions>
    </Card>
  )
}

const DISMISS_KEY = 'push-prompt-dismissed'

function shouldShowPrompt(): boolean {
  const dismissed = localStorage.getItem(DISMISS_KEY)
  if (dismissed) {
    const dismissedAt = parseInt(dismissed, 10)
    if (Date.now() - dismissedAt < 30 * 24 * 60 * 60 * 1000) return false
  }
  // Show after 2nd visit
  const visits = parseInt(localStorage.getItem('feed-visits') || '0', 10) + 1
  localStorage.setItem('feed-visits', String(visits))
  return visits >= 2
}

function NotificationPrompt() {
  const { isSupported, isSubscribed, subscribeToNotifications } = usePushNotifications()
  const [visible, setVisible] = useState(() => isSupported && !isSubscribed && shouldShowPrompt())
  const [loading, setLoading] = useState(false)

  if (!visible || isSubscribed) return null

  const handleEnable = async () => {
    setLoading(true)
    const ok = await subscribeToNotifications()
    setLoading(false)
    if (ok) setVisible(false)
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setVisible(false)
  }

  return (
    <Card elevation={1} sx={{ mb: 3, bgcolor: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: 2 }}>
      <CardContent sx={{ pb: '8px !important' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          <NotificationsActiveIcon sx={{ color: '#c9a84c', mt: 0.25 }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Get notified when friends post rounds
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Stay in the loop without opening the app
            </Typography>
          </Box>
          <IconButton size="small" onClick={handleDismiss} sx={{ mt: -0.5, mr: -0.5 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </CardContent>
      <CardActions sx={{ pt: 0, px: 2, pb: 1.5 }}>
        <Button size="small" variant="contained" onClick={handleEnable} disabled={loading} sx={{ textTransform: 'none' }}>
          {loading ? 'Enabling...' : 'Enable Notifications'}
        </Button>
      </CardActions>
    </Card>
  )
}

export default function FeedPage() {
  const queryClient = useQueryClient()
  const observerRef = useRef<HTMLDivElement>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { isSupported, isSubscribed, subscribeToNotifications, unsubscribeFromNotifications } = usePushNotifications()

  const {
    data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isRefetching,
  } = useInfiniteQuery({
    queryKey: ['feed'],
    queryFn: ({ pageParam }) => getFeed(pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchOnWindowFocus: true,
  })

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['feed'] })
  }, [queryClient])

  const handleToggleNotifications = async () => {
    if (isSubscribed) {
      await unsubscribeFromNotifications()
    } else {
      await subscribeToNotifications()
    }
  }

  // Infinite scroll observer
  useEffect(() => {
    if (!observerRef.current) return
    const el = observerRef.current
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const latestOwnRound = data?.pages[0]?.latestOwnRound ?? null
  const feedTeeTimes = data?.pages[0]?.feedTeeTimes ?? []
  const allFeedRounds = data?.pages.flatMap((p) => p.feed) ?? []

  if (isLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
  }

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', px: 2, py: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <PageHeader title="Activity" />
        <Box>
          <IconButton onClick={() => setSettingsOpen(true)} size="small" sx={{ mr: 0.5 }}>
            <SettingsIcon fontSize="small" />
          </IconButton>
          <IconButton onClick={handleRefresh} disabled={isRefetching} size="small">
            <RefreshIcon sx={{ animation: isRefetching ? 'spin 1s linear infinite' : 'none', '@keyframes spin': { '100%': { transform: 'rotate(360deg)' } } }} />
          </IconButton>
        </Box>
      </Box>

      <NotificationPrompt />

      {latestOwnRound && <OwnRoundCard round={latestOwnRound} />}

      {feedTeeTimes.map((tt) => (
        <TeeTimeCard key={tt.id} teeTime={tt} />
      ))}

      {allFeedRounds.length === 0 && !latestOwnRound && feedTeeTimes.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <PeopleIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Add friends to see their rounds
          </Typography>
          <Button variant="contained" component={Link} to="/friends">
            Find Friends
          </Button>
        </Box>
      )}

      {allFeedRounds.length === 0 && latestOwnRound && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography color="text.secondary">
            No recent rounds from your friends.
          </Typography>
        </Box>
      )}

      {allFeedRounds.map((round) => (
        <FeedCard key={round.id} round={round} />
      ))}

      <div ref={observerRef} />

      {isFetchingNextPage && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={24} />
        </Box>
      )}

      {/* Settings dialog */}
      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Settings</DialogTitle>
        <DialogContent>
          {isSupported ? (
            <FormControlLabel
              control={<Switch checked={isSubscribed} onChange={handleToggleNotifications} />}
              label="Push notifications"
            />
          ) : (
            <Typography variant="body2" color="text.secondary">
              Push notifications are not supported in this browser.
            </Typography>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  )
}
