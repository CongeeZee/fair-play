import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Box, Typography, Card, CardContent, Chip, Button,
  CircularProgress, IconButton, Snackbar, Dialog, DialogTitle,
  DialogContent, Switch, FormControlLabel, CardActions,
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import ShareIcon from '@mui/icons-material/Share'
import PeopleIcon from '@mui/icons-material/People'
import VisibilityIcon from '@mui/icons-material/Visibility'
import SettingsIcon from '@mui/icons-material/Settings'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import CloseIcon from '@mui/icons-material/Close'
import { Link } from 'react-router-dom'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { getFeed } from '../api/rounds'
import { formatCourseName, timeAgo } from '../utils'
import type { FeedRound, OwnLatestRound } from '../types'
import PageHeader from '../components/PageHeader'
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
        </CardContent>
      </Card>
      <Snackbar open={snackbar} autoHideDuration={2000} onClose={() => setSnackbar(false)} message="Link copied!" anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
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
        {round.shareId && (
          <Box sx={{ mt: 1.5, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
            <Button
              component={Link}
              to={`/scorecard/${round.shareId}`}
              size="small"
              startIcon={<VisibilityIcon />}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem' }}
            >
              View Scorecard
            </Button>
          </Box>
        )}
      </CardContent>
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

      {allFeedRounds.length === 0 && !latestOwnRound && (
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
