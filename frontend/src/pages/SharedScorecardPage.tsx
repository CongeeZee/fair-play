import { useState } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Box, Container, Typography, CircularProgress, Paper,
  Table, TableBody, TableCell, TableHead, TableRow,
  Button, Chip, TextField, IconButton, Snackbar, Tooltip,
} from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import CloseIcon from '@mui/icons-material/Close'
import EditIcon from '@mui/icons-material/Edit'
import IosShareIcon from '@mui/icons-material/IosShare'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import CelebrationIcon from '@mui/icons-material/Celebration'
import { getSharedScorecard } from '../api/rounds'
import { getReactions, getComments, addComment, deleteComment } from '../api/reactions'
import { formatCourseName, timeAgo } from '../utils'
import type { SharedScorecard } from '../types'
import ProfileLink from '../components/ProfileLink'
import UserAvatar from '../components/UserAvatar'
import ReactionBar from '../components/ReactionBar'
import { useAuth } from '../contexts/AuthContext'
import { CLAY, HEADING_FONT, tint } from '../theme'
import { holeBand, ON_GREEN } from '../scoreColors'

function toParLabel(n: number) {
  return n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`
}

/** Score relative to par as *text* on a light surface. */
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

/** Scorecard convention: circles under par, squares over, doubled for 2+. */
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
            ? diff === 1 ? `1.5px solid ${CLAY.infoText}` : `2.5px double ${CLAY.slateText}`
            : 'none',
          bgcolor: diff <= -2 ? CLAY.gold : diff === -1 ? CLAY.redDeep : 'transparent',
          color: diff <= -2 ? CLAY.onGold : diff === -1 ? '#fff' : scoreDiffText(diff),
          fontWeight: 700, fontSize: '0.8rem',
        }}
      >
        {strokes}
      </Box>
    </TableCell>
  )
}

function HalfTable({ label, holes, subtotalStrokes }: {
  label: 'Out' | 'In'
  holes: SharedScorecard['holes']
  subtotalStrokes: number
}) {
  const hasPutts = holes.some((h) => h.putts != null)
  const parSum = holes.reduce((s, h) => s + h.par, 0)
  const scoredPar = holes.filter((h) => h.strokes != null).reduce((s, h) => s + h.par, 0)
  const subtotalDiff = subtotalStrokes > 0 ? subtotalStrokes - scoredPar : null
  const cellSx = { fontSize: '0.75rem', px: 0.5 }
  return (
    <Box sx={{ overflowX: 'auto', mb: 2 }}>
      <Table size="small" sx={{ minWidth: 420 }}>
        <TableHead>
          <TableRow sx={{ bgcolor: 'primary.main' }}>
            <TableCell sx={{ color: '#fff', fontWeight: 700, py: 0.75, fontSize: '0.7rem', width: 52 }}>Hole</TableCell>
            {holes.map((h) => (
              <TableCell key={h.number} align="center" sx={{ color: '#fff', fontWeight: 600, py: 0.75, fontSize: '0.7rem', px: 0.5 }}>
                {h.number}
              </TableCell>
            ))}
            <TableCell align="center" sx={{ color: ON_GREEN.gold, fontWeight: 800, py: 0.75, fontSize: '0.7rem' }}>{label}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell sx={{ ...cellSx, fontWeight: 600, color: 'text.secondary' }}>Par</TableCell>
            {holes.map((h) => <TableCell key={h.number} align="center" sx={{ ...cellSx, color: 'text.secondary' }}>{h.par}</TableCell>)}
            <TableCell align="center" sx={{ ...cellSx, fontWeight: 700, color: 'text.secondary' }}>{parSum}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ ...cellSx, fontWeight: 600 }}>Score</TableCell>
            {holes.map((h) => <ScoreCell key={h.number} strokes={h.strokes} par={h.par} />)}
            <TableCell align="center" sx={{ fontWeight: 800, fontSize: '0.85rem', color: scoreDiffText(subtotalDiff) }}>
              {subtotalDiff != null ? subtotalStrokes : '-'}
            </TableCell>
          </TableRow>
          {hasPutts && (
            <TableRow>
              <TableCell sx={{ ...cellSx, fontWeight: 600, color: 'text.secondary' }}>Putts</TableCell>
              {holes.map((h) => <TableCell key={h.number} align="center" sx={{ ...cellSx, color: 'text.secondary' }}>{h.putts ?? '-'}</TableCell>)}
              <TableCell align="center" sx={{ ...cellSx, fontWeight: 700, color: 'text.secondary' }}>
                {holes.reduce((s, h) => s + (h.putts ?? 0), 0)}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Box>
  )
}

function StatTile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: CLAY.sunken, minWidth: 0 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block' }}>{label}</Typography>
      <Typography className="tabular" sx={{ fontFamily: HEADING_FONT, fontWeight: 800, fontSize: '1.4rem', lineHeight: 1.2 }}>
        {value}
      </Typography>
      {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
    </Box>
  )
}

function Breakdown({ b }: { b: SharedScorecard['stats']['breakdown'] }) {
  const items = [
    { label: 'Eagle+', n: b.eaglesOrBetter, color: CLAY.gold },
    { label: 'Birdies', n: b.birdies, color: CLAY.redDeep },
    { label: 'Pars', n: b.pars, color: CLAY.green },
    { label: 'Bogeys', n: b.bogeys, color: CLAY.clayBlue },
    { label: 'Double+', n: b.doublesOrWorse, color: CLAY.slate },
  ]
  const total = items.reduce((s, i) => s + i.n, 0)
  if (total === 0) return null
  return (
    <Box>
      <Box sx={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', gap: '2px', mb: 1.25 }}>
        {items.filter((i) => i.n > 0).map((i) => (
          <Box key={i.label} sx={{ flex: i.n, bgcolor: i.color }} />
        ))}
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5 }}>
        {items.filter((i) => i.n > 0).map((i) => (
          <Box key={i.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: i.color }} />
            <Typography variant="body2"><strong>{i.n}</strong> {i.label}</Typography>
          </Box>
        ))}
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

  return (
    <Paper elevation={0} sx={{ p: 2, mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography variant="h6">Comments{comments.length > 0 ? ` · ${comments.length}` : ''}</Typography>
        {reactions && (
          <ReactionBar roundId={roundId} reactionSummary={reactions.summary} userReaction={reactions.userReaction} />
        )}
      </Box>

      {comments.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          No comments yet — say something nice (or not).
        </Typography>
      )}

      {comments.map((c) => (
        <Box key={c.id} sx={{ display: 'flex', gap: 1.25, mb: 1.5, alignItems: 'flex-start' }}>
          <UserAvatar userId={c.userId} name={c.userName} size={32} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <ProfileLink userId={c.userId} name={c.userName} variant="body2" sx={{ color: 'text.primary' }} />
              <Typography variant="caption" color="text.secondary">{timeAgo(c.createdAt)}</Typography>
            </Box>
            <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>{c.text}</Typography>
          </Box>
          {(c.userId === userId || ownerId === userId) && (
            <Tooltip title="Delete comment">
              <IconButton aria-label="Delete comment" size="small" onClick={() => deleteMutation.mutate(c.id)} sx={{ color: 'text.secondary' }}>
                <CloseIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      ))}

      <Box sx={{ display: 'flex', gap: 0.5, mt: 1, alignItems: 'center' }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Write a comment…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) addMutation.mutate() }}
          slotProps={{ htmlInput: { maxLength: 280, 'aria-label': 'Write a comment' } }}
        />
        <IconButton aria-label="Post comment" onClick={() => addMutation.mutate()} disabled={!text.trim() || addMutation.isPending} color="primary">
          <SendIcon />
        </IconButton>
      </Box>
    </Paper>
  )
}

export default function SharedScorecardPage() {
  const { shareId } = useParams<{ shareId: string }>()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { user } = useAuth()
  const [copied, setCopied] = useState(false)

  const { data: scorecard, isLoading, error } = useQuery({
    queryKey: ['shared-scorecard', shareId],
    queryFn: () => getSharedScorecard(shareId!),
    enabled: !!shareId,
  })

  if (isLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
  }

  if (error || !scorecard) {
    return (
      <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="h4" sx={{ mb: 2 }}>Scorecard not found</Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          This scorecard may have been deleted or the link is invalid.
        </Typography>
        <Button variant="contained" onClick={() => navigate('/')}>Go to Fairplay</Button>
      </Container>
    )
  }

  const isOwner = !!user && parseInt(user.id) === scorecard.ownerId
  const justFinished = isOwner && params.get('finished') === '1'
  const frontNine = scorecard.holes.slice(0, 9)
  const backNine = scorecard.holes.slice(9)
  const { total, stats } = scorecard
  const scoredHoles = scorecard.holesScored
  const partial = !scorecard.inProgress && scoredHoles < scorecard.totalHoles

  const share = async () => {
    const url = `${window.location.origin}/scorecard/${shareId}`
    const course = formatCourseName(scorecard.courseName)
    const text = `Shot ${total.strokes} (${toParLabel(total.scoreToPar)}) at ${course}`
    if (navigator.share) {
      try { await navigator.share({ title: `${scorecard.playerName} at ${course}`, text, url }) } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    }
  }

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 2, sm: 3 }, pb: 4 }}>
      {user && (
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)} sx={{ mb: 1, ml: -1, color: 'text.secondary' }}>
          Back
        </Button>
      )}

      {justFinished && (
        <Paper elevation={0} sx={{ p: 2, mb: 2, bgcolor: tint(CLAY.gold, 0.2), borderColor: CLAY.goldGraphic, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <CelebrationIcon sx={{ color: CLAY.goldText }} />
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontWeight: 700 }}>Round complete!</Typography>
            <Typography variant="body2" color="text.secondary">It's in your feed for your mates to see.</Typography>
          </Box>
          <Button variant="contained" size="small" startIcon={<IosShareIcon />} onClick={share}>Share</Button>
        </Paper>
      )}

      {/* Who, where, when */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <UserAvatar userId={scorecard.ownerId} name={scorecard.playerName} size={48} link={!!user} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          {user
            ? <ProfileLink userId={scorecard.ownerId} name={scorecard.playerName} variant="body1" sx={{ color: 'text.primary' }} />
            : <Typography sx={{ fontWeight: 700 }}>{scorecard.playerName}</Typography>}
          <Typography variant="body2" color="text.secondary" noWrap>
            {formatCourseName(scorecard.courseName)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {new Date(scorecard.playedAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
            {partial && ` · ${scoredHoles} holes`}
          </Typography>
        </Box>
        {scorecard.inProgress && <Chip label={`Live · thru ${scoredHoles}`} size="small" color="success" sx={{ fontWeight: 700 }} />}
      </Box>

      {/* Score hero */}
      <Paper elevation={0} sx={{ p: 2.5, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography className="tabular" sx={{ fontFamily: HEADING_FONT, fontWeight: 800, fontSize: '3.5rem', lineHeight: 1, letterSpacing: '-0.04em' }}>
            {total.strokes || '–'}
          </Typography>
          {total.strokes > 0 && (
            <Chip label={toParLabel(total.scoreToPar)} sx={{ ...scoreDiffChip(total.scoreToPar), fontWeight: 800, fontSize: '1rem', height: 34, px: 0.5 }} />
          )}
          <Box sx={{ flex: 1 }} />
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Out</Typography>
            <Typography className="tabular" sx={{ fontWeight: 700 }}>{scorecard.frontNine.strokes || '–'}</Typography>
          </Box>
          {scorecard.backNine && (
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>In</Typography>
              <Typography className="tabular" sx={{ fontWeight: 700 }}>{scorecard.backNine.strokes || '–'}</Typography>
            </Box>
          )}
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 1, mt: 2.5 }}>
          {stats.putts != null && <StatTile label="Putts" value={stats.putts} sub={`${(stats.putts / scoredHoles).toFixed(1)} per hole`} />}
          {stats.greens != null && <StatTile label="Greens" value={`${stats.greens}/${scoredHoles}`} sub={`${Math.round((stats.greens / scoredHoles) * 100)}%`} />}
          {stats.fairways != null && stats.fairwayHoles > 0 && (
            <StatTile label="Fairways" value={`${stats.fairways}/${stats.fairwayHoles}`} sub={`${Math.round((stats.fairways / stats.fairwayHoles) * 100)}%`} />
          )}
          <StatTile label="Penalties" value={stats.penalties} />
        </Box>

        <Box sx={{ mt: 2.5 }}>
          <Breakdown b={stats.breakdown} />
        </Box>

        {isOwner && (
          <Box sx={{ display: 'flex', gap: 1, mt: 2.5 }}>
            <Button variant="outlined" startIcon={<EditIcon />} component={Link} to={`/rounds/${scorecard.roundId}`} sx={{ flex: 1 }}>
              {scorecard.inProgress ? 'Keep scoring' : 'Edit scores'}
            </Button>
            <Button variant="contained" startIcon={<IosShareIcon />} onClick={share} sx={{ flex: 1 }}>Share</Button>
          </Box>
        )}
      </Paper>

      {/* Scorecard */}
      <Paper elevation={0} sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ mb: 1.5 }}>Scorecard</Typography>
        <HalfTable label="Out" holes={frontNine} subtotalStrokes={scorecard.frontNine.strokes} />
        {backNine.length > 0 && scorecard.backNine && (
          <HalfTable label="In" holes={backNine} subtotalStrokes={scorecard.backNine.strokes} />
        )}
      </Paper>

      {/* Comments need an account: they are between friends, not public */}
      {user ? (
        <CommentsSection roundId={scorecard.roundId} ownerId={scorecard.ownerId} />
      ) : (
        <Paper elevation={0} sx={{ p: 3, textAlign: 'center', bgcolor: tint(CLAY.green, 0.06) }}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>Track your own rounds</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Free scoring, an automatic handicap, stats that show where you lose shots — and a feed for you and your mates.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
            <Button variant="contained" component={Link} to="/register">Create free account</Button>
            <Button component={Link} to="/login">Sign in</Button>
          </Box>
        </Paper>
      )}

      <Snackbar open={copied} autoHideDuration={2000} onClose={() => setCopied(false)} message="Link copied" anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} sx={{ mb: { xs: '76px', md: 0 } }} />
    </Container>
  )
}
