import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Box, Typography, Card, CardContent, Chip, Button, CircularProgress, IconButton, Snackbar, Dialog, DialogTitle, DialogContent, Switch, FormControlLabel, CardActions, TextField, useMediaQuery, useTheme,
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import SendIcon from '@mui/icons-material/Send'
import PeopleIcon from '@mui/icons-material/People'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import IosShareIcon from '@mui/icons-material/IosShare'
import SettingsIcon from '@mui/icons-material/Settings'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import CloseIcon from '@mui/icons-material/Close'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getFeed } from '../api/rounds'
import { joinTeeTime } from '../api/teetimes'
import { addComment } from '../api/reactions'
import { getLiveRounds } from '../api/live'
import { CLAY, tint, HEADING_FONT } from '../theme'
import { scoreBand } from '../scoreColors'
import { getRecentAchievements } from '../api/achievements'
import { formatCourseName, timeAgo } from '../utils'
import type { FeedRound, FeedTeeTime, RecentComment, LiveRound, RecentAchievement, RoundPartner } from '../types'
import PageHeader from '../components/PageHeader'
import ProfileLink from '../components/ProfileLink'
import UserAvatar from '../components/UserAvatar'
import ReactionBar from '../components/ReactionBar'
import StarRating from '../components/StarRating'
import { usePushNotifications } from '../hooks/usePushNotifications'
import EmptyState from '../components/EmptyState'
import ResumeRoundBanner from '../components/ResumeRoundBanner'
import FeedSidebar from '../components/FeedSidebar'
import SportsGolfIcon from '@mui/icons-material/SportsGolf'

/**
 * Returns the chip's background *and* its foreground. The previous version
 * returned a background only, and every caller paired it with white — which is
 * unreadable on gold (1.86:1) and short of AA on the mid green (4.09:1).
 */
function scoreChip(scoreToPar: number) {
  const b = scoreBand(scoreToPar, 5)
  return { bgcolor: b.fill, color: b.on }
}

function scoreLabel(scoreToPar: number) {
  if (scoreToPar === 0) return 'E'
  return scoreToPar > 0 ? `+${scoreToPar}` : `${scoreToPar}`
}

function LiveNowSection({ rounds }: { rounds: LiveRound[] }) {
  const navigate = useNavigate()
  if (rounds.length === 0) return null

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Box sx={{
          width: 8, height: 8, borderRadius: '50%', bgcolor: '#63b47f',
          animation: 'pulse 2s infinite',
          '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.4 } },
        }} />
        Live Now
      </Typography>
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          overflowX: 'auto',
          // The clay card shadow spreads ~14px down-right; anything less than
          // this padding lets `overflowX: auto` clip it and the cards read as
          // cut off rather than raised.
          p: 2,
          // Full-bleed only where there's room for it. On a phone the container
          // gutter is 16px, so -2 pushes the well past the viewport edge and its
          // left corner gets cut off.
          mx: { xs: 0, sm: -2 },
          borderRadius: 2.2,
          // A sunken well rather than a flat tint, so the raised cards have
          // something to sit in.
          bgcolor: 'var(--c-sunken)',
          // Hide scrollbars but keep scrolling
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {rounds.map((r) => (
          <Card
            key={r.roundId}
            elevation={2}
            onClick={() => navigate(`/live/${r.roundId}`)}
            sx={{ minWidth: 200, cursor: 'pointer', borderRadius: 2.2, flexShrink: 0 }}
          >
            <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                <Box sx={{
                  width: 6, height: 6, borderRadius: '50%', bgcolor: '#63b47f',
                  animation: 'pulse 2s infinite',
                }} />
                <ProfileLink userId={r.playerId} name={r.playerName} variant="body2" onClick={(e) => e.stopPropagation()} />
              </Box>
              <Typography variant="caption" color="text.secondary" noWrap>
                {formatCourseName(r.courseName)}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Through {r.holesCompleted}
                </Typography>
                <Chip
                  label={r.currentScoreToPar === 0 ? 'E' : r.currentScoreToPar > 0 ? `+${r.currentScoreToPar}` : `${r.currentScoreToPar}`}
                  size="small"
                  sx={{
                    height: 20, fontSize: '0.65rem', fontWeight: 700,
                    ...scoreChip(r.currentScoreToPar),
                  }}
                />
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  )
}

function ReviewLine({ review, courseName }: { review: { rating: number; text: string | null }; courseName: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.75, flexWrap: 'wrap' }}>
      <Typography variant="caption" color="text.secondary">
        Rated {formatCourseName(courseName)}
      </Typography>
      <StarRating value={review.rating} readOnly size="small" />
      {review.text && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ flex: '1 1 100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          “{review.text}”
        </Typography>
      )}
    </Box>
  )
}

function InlineComments({ roundId, shareId, commentCount, recentComments, inputOpen, onCloseInput }: {
  roundId: number
  shareId: string | null
  commentCount: number
  recentComments: RecentComment[]
  inputOpen: boolean
  onCloseInput: () => void
}) {
  const [text, setText] = useState('')
  const queryClient = useQueryClient()
  const [optimisticComments, setOptimisticComments] = useState<RecentComment[]>(recentComments)
  const [optimisticCount, setOptimisticCount] = useState(commentCount)

  // Re-sync with the server's copy when a refetch brings a new count. Kept in
  // state rather than a ref: React allows setState during render for exactly
  // this "derive from changed props" case, but not reading a ref.
  const key = `${roundId}-${commentCount}`
  const [syncedKey, setSyncedKey] = useState(key)
  if (key !== syncedKey) {
    setSyncedKey(key)
    setOptimisticComments(recentComments)
    setOptimisticCount(commentCount)
  }

  const commentMutation = useMutation({
    mutationFn: () => addComment(roundId, text.trim()),
    onSuccess: (data) => {
      setOptimisticComments((prev) => [...prev.slice(-1), { userId: data.userId, name: data.userName, text: data.text }])
      setOptimisticCount((c) => c + 1)
      setText('')
      onCloseInput()
      queryClient.invalidateQueries({ queryKey: ['feed'] })
    },
  })

  if (optimisticComments.length === 0 && !inputOpen) return null

  return (
    <Box sx={{ mt: 1.25, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {optimisticCount > 2 && shareId && (
        <Typography
          component={Link}
          to={`/scorecard/${shareId}`}
          variant="caption"
          sx={{ color: 'text.secondary', textDecoration: 'none', fontWeight: 600, '&:hover': { textDecoration: 'underline' } }}
        >
          View all {optimisticCount} comments
        </Typography>
      )}
      {optimisticComments.map((c, i) => (
        <Typography key={i} variant="body2" sx={{ color: 'text.primary', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          <ProfileLink userId={c.userId} name={c.name} variant="body2" sx={{ color: 'text.primary' }} />{' '}
          {c.text}
        </Typography>
      ))}

      {inputOpen && (
        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, alignItems: 'center' }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Write a comment…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && text.trim()) commentMutation.mutate()
              if (e.key === 'Escape') onCloseInput()
            }}
            autoFocus
            slotProps={{ htmlInput: { maxLength: 280, 'aria-label': 'Write a comment' } }}
          />
          <IconButton aria-label="Post comment"
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

function PartnersLine({ partners }: { partners: RoundPartner[] }) {
  if (!partners || partners.length === 0) return null
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
      with{' '}
      {partners.map((p, i) => (
        <span key={p.id}>
          <ProfileLink userId={p.id} name={p.name} variant="caption" sx={{ color: 'text.primary', fontWeight: 600 }} />
          {i < partners.length - 1 ? ', ' : ''}
        </span>
      ))}
    </Typography>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.2, fontWeight: 500 }}>
        {label}
      </Typography>
      <Typography className="tabular" sx={{ fontWeight: 700, fontSize: '1.05rem', lineHeight: 1.35 }}>
        {value}
      </Typography>
    </Box>
  )
}

async function shareRound(round: FeedRound) {
  if (!round.shareId) return false
  const url = `${window.location.origin}/scorecard/${round.shareId}`
  const courseName = formatCourseName(round.courseName)
  const scoreStr = round.scoreToPar === 0 ? 'even par' : round.scoreToPar > 0 ? `+${round.scoreToPar}` : `${round.scoreToPar}`
  if (navigator.share) {
    try { await navigator.share({ title: `My round at ${courseName}`, text: `Shot ${round.totalStrokes} (${scoreStr})`, url }) } catch { /* cancelled */ }
    return false
  }
  await navigator.clipboard.writeText(url)
  return true
}

function FeedCard({ round, onCopied }: { round: FeedRound; onCopied: () => void }) {
  const [commentOpen, setCommentOpen] = useState(false)
  const h = round.highlights
  const partial = round.totalHoles < round.courseHoles
  const detailTo = round.shareId ? `/scorecard/${round.shareId}` : null

  const stats: { label: string; value: string | number }[] = []
  if (h) {
    if (h.birdiesOrBetter > 0) stats.push({ label: h.birdiesOrBetter === 1 ? 'Birdie' : 'Birdies', value: h.birdiesOrBetter })
    else stats.push({ label: 'Pars', value: h.pars })
    if (h.putts != null) stats.push({ label: 'Putts', value: h.putts })
    if (h.girs != null) stats.push({ label: 'Greens', value: `${h.girs}/${round.totalHoles}` })
    if (h.fairways != null && h.fairwayHoles > 0) stats.push({ label: 'Fairways', value: `${h.fairways}/${h.fairwayHoles}` })
  }

  return (
    <Card
      elevation={1}
      sx={{
        mb: 2,
        ...(round.viewerTagged && { borderColor: CLAY.goldGraphic }),
      }}
    >
      <CardContent sx={{ pb: '12px !important' }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <UserAvatar userId={round.playerId} name={round.playerName} size={40} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, flexWrap: 'wrap' }}>
              <ProfileLink userId={round.playerId} name={round.isOwn ? 'You' : round.playerName} variant="body1" sx={{ color: 'text.primary' }} />
              <Typography variant="caption" color="text.secondary">{timeAgo(round.playedAt)}</Typography>
            </Box>
            <PartnersLine partners={round.partners} />
          </Box>
          {round.viewerTagged && (
            <Chip label="Tagged" size="small" sx={{ bgcolor: tint(CLAY.gold, 0.25), color: CLAY.goldText, fontWeight: 700, height: 22 }} />
          )}
        </Box>

        {/* Round — tapping it opens the full scorecard */}
        <Box
          component={detailTo ? Link : 'div'}
          {...(detailTo ? { to: detailTo } : {})}
          sx={{ display: 'block', color: 'inherit', textDecoration: 'none', mt: 1.5, borderRadius: 3, '&:hover .course-name': detailTo ? { textDecoration: 'underline' } : {} }}
        >
          <Typography className="course-name" variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }} noWrap>
            {formatCourseName(round.courseName)}
          </Typography>
          {partial && (
            <Typography variant="caption" color="text.secondary">{round.totalHoles} holes</Typography>
          )}

          <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 2.5, mt: 1.25 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography className="tabular" sx={{ fontFamily: HEADING_FONT, fontWeight: 800, fontSize: '2.25rem', lineHeight: 1, letterSpacing: '-0.03em' }}>
                {round.totalStrokes}
              </Typography>
              <Chip
                label={scoreLabel(round.scoreToPar)}
                size="small"
                sx={{ ...scoreChip(round.scoreToPar), fontWeight: 700, height: 24 }}
              />
            </Box>
            <Box sx={{ display: 'grid', gridAutoFlow: 'column', gap: { xs: 2, sm: 3 }, minWidth: 0, overflow: 'hidden' }}>
              {stats.slice(0, 3).map((s) => <Stat key={s.label} {...s} />)}
            </Box>
          </Box>
        </Box>

        {round.review && <ReviewLine review={round.review} courseName={round.courseName} />}

        {/* Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1.5, pt: 1, borderTop: '1px solid', borderColor: 'var(--c-borderC)' }}>
          <ReactionBar
            roundId={round.id}
            reactionSummary={round.reactionSummary}
            userReaction={round.userReaction}
          />
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            startIcon={<ChatBubbleOutlineIcon />}
            onClick={() => setCommentOpen((o) => !o)}
            aria-expanded={commentOpen}
            sx={{ color: 'text.secondary', px: 1.25 }}
          >
            {round.commentCount > 0 ? round.commentCount : 'Comment'}
          </Button>
          {round.isOwn && round.shareId && (
            <IconButton aria-label="Share round" size="small" onClick={async () => { if (await shareRound(round)) onCopied() }} sx={{ color: 'text.secondary' }}>
              <IosShareIcon fontSize="small" />
            </IconButton>
          )}
        </Box>

        <InlineComments
          roundId={round.id}
          shareId={round.shareId}
          commentCount={round.commentCount}
          recentComments={round.recentComments}
          inputOpen={commentOpen}
          onCloseInput={() => setCommentOpen(false)}
        />
      </CardContent>
    </Card>
  )
}

function AchievementFeedCard({ achievement }: { achievement: RecentAchievement }) {
  const courseName = typeof achievement.metadata?.course === 'string' ? achievement.metadata.course : null
  return (
    <Card elevation={2} sx={{ mb: 1.5, borderRadius: 2, bgcolor: tint(CLAY.gold, 0.16) }}>
      <CardContent sx={{ pb: '12px !important' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography sx={{ fontSize: '2.25rem', lineHeight: 1 }}>{achievement.emoji}</Typography>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              <ProfileLink userId={achievement.userId} name={achievement.userName} variant="body2" sx={{ fontWeight: 700 }} />{' '}
              unlocked {achievement.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {achievement.description}{courseName ? ` · ${formatCourseName(courseName)}` : ''} · {timeAgo(achievement.unlockedAt)}
            </Typography>
          </Box>
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
    <Card elevation={2} sx={{ mb: 1.5, borderRadius: 2, bgcolor: tint(CLAY.green, 0.06) }}>
      <CardContent sx={{ pb: '12px !important' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <ProfileLink userId={teeTime.creatorId} name={teeTime.creatorName} variant="subtitle2" />
            <Typography variant="body2" sx={{ mt: 0.25 }}>
              Looking for players{teeTime.courseName ? ` at ${formatCourseName(teeTime.courseName)}` : ''}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {dateLabel} · {timeLabel} · {spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left
            </Typography>
          </Box>
          <Chip label="Tee Time" size="small" sx={{ bgcolor: 'primary.main', color: '#fff', fontWeight: 600, fontSize: '0.65rem', height: 22 }} />
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
    <Card elevation={2} sx={{ mb: 3, bgcolor: tint(CLAY.gold, 0.18), borderRadius: 2 }}>
      <CardContent sx={{ pb: '8px !important' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          <NotificationsActiveIcon sx={{ color: CLAY.goldText, mt: 0.25 }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Get notified when friends post rounds
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Stay in the loop without opening the app
            </Typography>
          </Box>
          <IconButton aria-label="Dismiss" size="small" onClick={handleDismiss} sx={{ mt: -0.5, mr: -0.5 }}>
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
  const location = useLocation()
  const inviteToast = (location.state as { inviteToast?: string } | null)?.inviteToast ?? null
  const [inviteSnack, setInviteSnack] = useState(!!inviteToast)
  const [copiedSnack, setCopiedSnack] = useState(false)
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

  const { data: liveData } = useQuery({
    queryKey: ['live-rounds'],
    queryFn: getLiveRounds,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  })

  const { data: recentAchievements } = useQuery({
    queryKey: ['recent-achievements'],
    queryFn: getRecentAchievements,
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

  // `lg` matches the breakpoint the sidebar is laid out at, so the query it
  // owns and the column it lives in appear and disappear together.
  const theme = useTheme()
  const showSidebar = useMediaQuery(theme.breakpoints.up('lg'))

  const feedTeeTimes = data?.pages[0]?.feedTeeTimes ?? []
  const allFeedRounds = data?.pages.flatMap((p) => p.feed) ?? []

  /* The spinner used to return before the sidebar existed in the tree, so the
     sidebar's two queries could not even start until the feed had finished
     loading — a serial waterfall worth a whole extra round-trip to the database
     on a page that could have made all three requests at once. Rendering the
     shell during loading lets them go out together. */
  if (isLoading) {
    return (
      <Box sx={{ maxWidth: { xs: 600, lg: 960 }, mx: 'auto', px: 2, py: 3, display: 'flex', gap: 4, alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1, maxWidth: 600, minWidth: 0, mx: 'auto', display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
        {showSidebar && (
          <Box sx={{ width: 300, flexShrink: 0, position: 'sticky', top: 88 }}>
            <FeedSidebar />
          </Box>
        )}
      </Box>
    )
  }

  return (
    // Two-column shell on large screens: main feed (600px) + sticky sidebar.
    // Below `lg` the sidebar disappears and this collapses to the original
    // single centered column.
    <Box
      sx={{
        maxWidth: { xs: 600, lg: 960 },
        mx: 'auto',
        px: 2,
        py: 3,
        display: 'flex',
        gap: 4,
        alignItems: 'flex-start',
      }}
    >
    <Box sx={{ flex: 1, maxWidth: 600, minWidth: 0, mx: 'auto' }}>
      <PageHeader
        title="Activity"
        subtitle="What you and your mates have been playing"
        action={
          <Box>
            <IconButton aria-label="Feed settings" onClick={() => setSettingsOpen(true)} size="small" sx={{ mr: 0.5 }}>
              <SettingsIcon fontSize="small" />
            </IconButton>
            <IconButton aria-label="Refresh feed" onClick={handleRefresh} disabled={isRefetching} size="small">
              <RefreshIcon sx={{ animation: isRefetching ? 'spin 1s linear infinite' : 'none', '@keyframes spin': { '100%': { transform: 'rotate(360deg)' } } }} />
            </IconButton>
          </Box>
        }
      />

      <NotificationPrompt />

      {liveData?.ownLiveRound && <ResumeRoundBanner round={liveData.ownLiveRound} />}

      <LiveNowSection rounds={liveData?.liveRounds ?? []} />

      {feedTeeTimes.map((tt) => (
        <TeeTimeCard key={tt.id} teeTime={tt} />
      ))}

      {allFeedRounds.length === 0 && feedTeeTimes.length === 0 && (
        <EmptyState
          icon={<PeopleIcon sx={{ fontSize: 36 }} />}
          title="Your feed is quiet — for now"
          description="Tee off a round or invite your golf mates to fill this with scores, comments, and tee times."
          primary={{ label: 'Start a round', to: '/play', icon: <SportsGolfIcon /> }}
          secondary={{ label: 'Invite mates', to: '/friends' }}
        />
      )}

      {/* Only your own rounds so far — nudge towards bringing friends in */}
      {allFeedRounds.length > 0 && allFeedRounds.every((r) => r.isOwn) && (
        <EmptyState
          icon={<PeopleIcon sx={{ fontSize: 36 }} />}
          title="Golf's better with mates"
          description="Share an invite link so your group can post their scores, react, and compete."
          primary={{ label: 'Invite mates', to: '/friends' }}
        />
      )}

      {(() => {
        type RoundItem = { kind: 'round'; date: string; round: FeedRound }
        type AchievementItem = { kind: 'achievement'; date: string; achievement: RecentAchievement }
        const items: (RoundItem | AchievementItem)[] = [
          ...allFeedRounds.map((r) => ({ kind: 'round' as const, date: r.playedAt, round: r })),
          ...(recentAchievements ?? []).map((a) => ({ kind: 'achievement' as const, date: a.unlockedAt, achievement: a })),
        ]
        items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        return items.map((item) =>
          item.kind === 'round'
            ? <FeedCard key={`r-${item.round.id}`} round={item.round} onCopied={() => setCopiedSnack(true)} />
            : <AchievementFeedCard key={`a-${item.achievement.id}`} achievement={item.achievement} />
        )
      })()}

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
      <Snackbar
        open={copiedSnack}
        autoHideDuration={2000}
        onClose={() => setCopiedSnack(false)}
        message="Link copied"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ mb: { xs: '76px', md: 0 } }}
      />
      <Snackbar
        open={inviteSnack}
        autoHideDuration={4000}
        onClose={() => setInviteSnack(false)}
        message={inviteToast ?? ''}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ mb: { xs: '68px', md: 0 } }}
      />
    </Box>

    {/* Desktop sidebar — upcoming tee times and competitions at a glance.
        Mounted only at `lg`, not merely hidden with `display: none`. It owns two
        queries of its own, and a hidden-but-mounted sidebar still ran both of
        them on every phone that opened the feed — two requests for a panel that
        viewport can never show. */}
    {showSidebar && (
      <Box
        sx={{
          width: 300,
          flexShrink: 0,
          position: 'sticky',
          top: 88,
        }}
      >
        <FeedSidebar />
      </Box>
    )}
    </Box>
  )
}
