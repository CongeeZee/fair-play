import { useCallback, useEffect, useRef } from 'react'
import {
  Box, Typography, Card, CardContent, Chip, Button,
  CircularProgress, IconButton, Snackbar,
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import ShareIcon from '@mui/icons-material/Share'
import PeopleIcon from '@mui/icons-material/People'
import VisibilityIcon from '@mui/icons-material/Visibility'
import { Link } from 'react-router-dom'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { getFeed } from '../api/rounds'
import { formatCourseName, timeAgo } from '../utils'
import { useState } from 'react'
import type { FeedRound, OwnLatestRound } from '../types'
import PageHeader from '../components/PageHeader'

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

export default function FeedPage() {
  const queryClient = useQueryClient()
  const observerRef = useRef<HTMLDivElement>(null)

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
  const hasFriends = allFeedRounds.length > 0 || (data?.pages.length ?? 0) > 0

  if (isLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
  }

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', px: 2, py: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <PageHeader title="Activity" />
        <IconButton onClick={handleRefresh} disabled={isRefetching} size="small">
          <RefreshIcon sx={{ animation: isRefetching ? 'spin 1s linear infinite' : 'none', '@keyframes spin': { '100%': { transform: 'rotate(360deg)' } } }} />
        </IconButton>
      </Box>

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
    </Box>
  )
}
