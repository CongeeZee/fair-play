import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Box, Container, Typography, CircularProgress, Paper,
  Table, TableBody, TableCell, TableHead, TableRow,
  Button, Chip, Alert, TextField, IconButton, Avatar,
} from '@mui/material'
import GolfCourseIcon from '@mui/icons-material/GolfCourse'
import SendIcon from '@mui/icons-material/Send'
import CloseIcon from '@mui/icons-material/Close'
import { getSharedScorecard } from '../api/rounds'
import { getReactions, getComments, addComment, deleteComment } from '../api/reactions'
import { formatCourseName, timeAgo } from '../utils'
import type { SharedScorecard } from '../types'
import ProfileLink from '../components/ProfileLink'
import ReactionBar from '../components/ReactionBar'
import { useAuth } from '../contexts/AuthContext'
import { CLAY } from '../theme'
import { holeBand, ON_GREEN } from '../scoreColors'

/**
 * Score relative to par as *text* on a light surface. The previous version
 * returned one hex that callers used both as text and as a chip background;
 * the gold branch measured 1.73:1 as text and 1.86:1 under white as a fill,
 * failing in both directions at once.
 */
function scoreDiffText(diff: number | null): string {
  if (diff == null) return CLAY.inkSoft
  return holeBand(diff).text
}

/** Score relative to par as a filled chip: background plus its foreground. */
function scoreDiffChip(diff: number | null) {
  if (diff == null) return { bgcolor: CLAY.inkSoft, color: '#fff' }
  const b = holeBand(diff)
  return { bgcolor: b.fill, color: b.on }
}

function ScoreCell({ strokes, par }: { strokes: number | null; par: number }) {
  if (strokes == null) return <TableCell align="center" sx={{ color: 'text.disabled', fontSize: '0.78rem' }}>-</TableCell>
  const diff = strokes - par
  const isCircle = diff <= -1
  const isBorder = diff >= 1
  return (
    <TableCell align="center" sx={{ p: 0.5 }}>
      <Box
        sx={{
          width: 28, height: 28, mx: 'auto',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: isCircle ? '50%' : 1,
          border: isBorder
            ? diff === 1 ? `1px solid ${CLAY.warningText}` : `2px solid ${CLAY.errorText}`
            : 'none',
          bgcolor: diff <= -2 ? CLAY.gold : diff === -1 ? CLAY.green : 'transparent',
          color: diff <= -2 ? CLAY.onGold : diff === -1 ? '#fff' : scoreDiffText(diff),
          fontWeight: 700, fontSize: '0.8rem',
        }}
      >
        {strokes}
      </Box>
    </TableCell>
  )
}

function HalfTable({
  label,
  holes,
  subtotalStrokes,
  subtotalPar,
}: {
  label: string
  holes: SharedScorecard['holes']
  subtotalStrokes: number
  subtotalPar: number
}) {
  const subtotalDiff = subtotalStrokes > 0 ? subtotalStrokes - subtotalPar : null
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'text.secondary', ml: 0.5, display: 'block', mb: 0.5 }}>
        {label}
      </Typography>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 420 }}>
          <TableHead>
            <TableRow sx={{ bgcolor: 'primary.main' }}>
              <TableCell sx={{ color: '#fff', fontWeight: 700, py: 0.75, fontSize: '0.7rem', width: 44 }}>Hole</TableCell>
              {holes.map((h) => (
                <TableCell key={h.number} align="center" sx={{ color: '#fff', fontWeight: 600, py: 0.75, fontSize: '0.7rem' }}>
                  {h.number}
                </TableCell>
              ))}
              <TableCell align="center" sx={{ color: ON_GREEN.gold, fontWeight: 800, py: 0.75, fontSize: '0.7rem' }}>
                {label.includes('Front') ? 'Out' : 'In'}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: 'text.secondary' }}>Par</TableCell>
              {holes.map((h) => (
                <TableCell key={h.number} align="center" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{h.par}</TableCell>
              ))}
              <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'text.secondary' }}>
                {holes.reduce((s, h) => s + h.par, 0)}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Score</TableCell>
              {holes.map((h) => (
                <ScoreCell key={h.number} strokes={h.strokes} par={h.par} />
              ))}
              <TableCell align="center" sx={{ fontWeight: 800, fontSize: '0.8rem' }}>
                {subtotalDiff != null ? (
                  <Box component="span" sx={{ color: scoreDiffText(subtotalDiff) }}>
                    {subtotalStrokes}
                  </Box>
                ) : '-'}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Box>
    </Box>
  )
}

function CommentsSection({ roundId, ownerId }: { roundId: number; ownerId: number }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [text, setText] = useState('')

  const { data: reactions } = useQuery({
    queryKey: ['reaction-detail', roundId],
    queryFn: () => getReactions(roundId),
  })

  const { data: comments = [] } = useQuery({
    queryKey: ['comments', roundId],
    queryFn: () => getComments(roundId),
  })

  const addMutation = useMutation({
    mutationFn: () => addComment(roundId, text.trim()),
    onSuccess: () => {
      setText('')
      queryClient.invalidateQueries({ queryKey: ['comments', roundId] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (commentId: string) => deleteComment(roundId, commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', roundId] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
    },
  })

  const userId = user ? parseInt(user.id) : null
  const canComment = !!user

  return (
    <Paper elevation={0} sx={{ borderRadius: 2, p: 2, mb: 3 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
        Reactions & Comments
      </Typography>

      {/* Reaction bar */}
      {reactions && (
        <ReactionBar
          roundId={roundId}
          reactionSummary={reactions.summary}
          userReaction={reactions.userReaction}
          readOnly={!user}
        />
      )}

      {/* Comments list */}
      {comments.length > 0 && (
        <Box sx={{ mt: 2 }}>
          {comments.map((c) => (
            <Box key={c.id} sx={{ display: 'flex', gap: 1, mb: 1.5, alignItems: 'flex-start' }}>
              <Avatar sx={{ width: 28, height: 28, fontSize: '0.75rem', bgcolor: 'primary.main' }}>
                {c.userName.charAt(0).toUpperCase()}
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                  <ProfileLink userId={c.userId} name={c.userName} variant="caption" />
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                    {timeAgo(c.createdAt)}
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ fontSize: '0.85rem', wordBreak: 'break-word' }}>
                  {c.text}
                </Typography>
              </Box>
              {(c.userId === userId || ownerId === userId) && (
                <IconButton aria-label="Delete comment"
                  size="small"
                  onClick={() => deleteMutation.mutate(c.id)}
                  sx={{ mt: -0.25, opacity: 0.5, '&:hover': { opacity: 1 } }}
                >
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              )}
            </Box>
          ))}
        </Box>
      )}

      {/* Comment input or CTA */}
      {canComment ? (
        <Box sx={{ display: 'flex', gap: 0.5, mt: 1.5, alignItems: 'center' }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Write a comment..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) addMutation.mutate() }}
            slotProps={{ input: { sx: { fontSize: '0.85rem' } } }}
          />
          <IconButton aria-label="Post comment"
            onClick={() => addMutation.mutate()}
            disabled={!text.trim() || addMutation.isPending}
            color="primary"
          >
            <SendIcon />
          </IconButton>
        </Box>
      ) : (
        <Box sx={{ mt: 2, textAlign: 'center' }}>
          <Button variant="outlined" size="small" href="/register" sx={{ textTransform: 'none' }}>
            Sign up to join the conversation
          </Button>
        </Box>
      )}
    </Paper>
  )
}

export default function SharedScorecardPage() {
  const { shareId } = useParams<{ shareId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const { data: scorecard, isLoading, error } = useQuery({
    queryKey: ['shared-scorecard', shareId],
    queryFn: () => getSharedScorecard(shareId!),
    enabled: !!shareId,
  })

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error || !scorecard) {
    return (
      <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 2, color: 'primary.main' }}>
          Scorecard not found
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          This scorecard may have been deleted or the link is invalid.
        </Typography>
        <Button variant="contained" onClick={() => navigate('/')}>
          Go to Fairplay
        </Button>
      </Container>
    )
  }

  const frontNine = scorecard.holes.slice(0, 9)
  const backNine = scorecard.holes.slice(9)
  const { total } = scorecard
  const scoreToParStr = total.scoreToPar === 0 ? 'E' : total.scoreToPar > 0 ? `+${total.scoreToPar}` : `${total.scoreToPar}`

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ textAlign: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1 }}>
          <GolfCourseIcon sx={{ color: 'primary.main' }} />
          <Typography variant="h6" sx={{ fontWeight: 800, color: 'primary.main' }}>
            Fairplay
          </Typography>
        </Box>

        {user ? (
          <ProfileLink userId={scorecard.ownerId} name={scorecard.playerName} variant="h5" sx={{ fontWeight: 700, mb: 0.5 }} />
        ) : (
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
            {scorecard.playerName}
          </Typography>
        )}
        <Typography variant="body1" color="text.secondary" sx={{ mb: 0.5 }}>
          {formatCourseName(scorecard.courseName)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {new Date(scorecard.playedAt).toLocaleDateString('en-GB', { dateStyle: 'long' })}
        </Typography>

        {scorecard.inProgress && (
          <Alert severity="info" sx={{ mt: 2, justifyContent: 'center' }}>
            Round in progress - {scorecard.holesScored} of {scorecard.totalHoles} holes scored
          </Alert>
        )}
      </Box>

      {/* Score summary */}
      <Paper elevation={0} sx={{ borderRadius: 2, p: 2, mb: 3, textAlign: 'center' }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 2 }}>
          <Box>
            <Typography variant="h3" sx={{ fontWeight: 800, color: 'primary.main' }}>
              {total.strokes || '-'}
            </Typography>
            <Typography variant="caption" color="text.secondary">Total</Typography>
          </Box>
          {total.strokes > 0 && (
            <Chip
              label={scoreToParStr}
              sx={{
                ...scoreDiffChip(total.scoreToPar),
                color: '#fff',
                fontWeight: 800,
                fontSize: '1rem',
                height: 36,
              }}
            />
          )}
        </Box>
      </Paper>

      {/* Scorecard tables */}
      <Paper elevation={0} sx={{ borderRadius: 2, p: 2, mb: 3 }}>
        <HalfTable
          label="Front 9"
          holes={frontNine}
          subtotalStrokes={scorecard.frontNine.strokes}
          subtotalPar={scorecard.frontNine.par}
        />
        {backNine.length > 0 && scorecard.backNine && (
          <HalfTable
            label="Back 9"
            holes={backNine}
            subtotalStrokes={scorecard.backNine.strokes}
            subtotalPar={scorecard.backNine.par}
          />
        )}

        {/* Total row */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 3, mt: 1, px: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Par: <strong>{total.par}</strong>
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Score: <strong>{total.strokes || '-'}</strong>
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700, color: scoreDiffText(total.scoreToPar) }}>
            {scoreToParStr}
          </Typography>
        </Box>
      </Paper>

      {/* Reactions & Comments */}
      <CommentsSection roundId={scorecard.roundId} ownerId={scorecard.ownerId} />

      {/* CTA */}
      <Box sx={{ textAlign: 'center' }}>
        <Button
          variant="contained"
          size="large"
          onClick={() => navigate('/register')}
          sx={{ fontWeight: 700, px: 4 }}
        >
          Track your own rounds
        </Button>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Free golf scoring, handicap tracking, and game insights
        </Typography>
      </Box>
    </Container>
  )
}
