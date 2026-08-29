import { useState, useMemo } from 'react'
import { CLAY } from '../theme'
import { SCORE } from '../scoreColors'
import { formatCourseName } from '../utils'
import PageHeader from '../components/PageHeader'
import {
  Box, Container, Typography, CircularProgress, Alert,
  List, ListItem, ListItemButton, ListItemText, Paper, Chip, Divider,
  IconButton, Dialog, DialogTitle, DialogContent, DialogContentText,
  DialogActions, Button, TextField, InputAdornment, Fab, Tooltip,
  Menu, MenuItem, ListItemIcon,
} from '@mui/material'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import HistoryIcon from '@mui/icons-material/History'
import SearchIcon from '@mui/icons-material/Search'
import ClearIcon from '@mui/icons-material/Clear'
import AddIcon from '@mui/icons-material/Add'
import ShareIcon from '@mui/icons-material/Share'
import Snackbar from '@mui/material/Snackbar'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRounds, getRound, deleteRound } from '../api/rounds'
import type { Round } from '../types'
import EmptyState from '../components/EmptyState'
import SportsGolfIcon from '@mui/icons-material/SportsGolf'

export default function HistoryPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmRound, setConfirmRound] = useState<Round | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [shareSnackbar, setShareSnackbar] = useState(false)
  // Row overflow menu — one kebab per row instead of three icon buttons
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [menuRound, setMenuRound] = useState<Round | null>(null)

  const openRowMenu = (e: React.MouseEvent<HTMLElement>, round: Round) => {
    e.stopPropagation()
    setMenuAnchor(e.currentTarget)
    setMenuRound(round)
  }
  const closeRowMenu = () => {
    setMenuAnchor(null)
    setMenuRound(null)
  }

  const handleShare = async (round: Round) => {
    if (!round.shareId) return
    const url = `${window.location.origin}/scorecard/${round.shareId}`
    const courseName = round.course?.name ? formatCourseName(round.course.name) : 'a round'
    const scoreStr = round.scoreToPar != null
      ? (round.scoreToPar === 0 ? 'even par' : round.scoreToPar > 0 ? `+${round.scoreToPar}` : `${round.scoreToPar}`)
      : ''
    const title = `Check out my round at ${courseName}`
    const text = scoreStr ? `Shot ${round.totalStrokes} (${scoreStr}) at ${courseName}` : `Played at ${courseName}`

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url })
      } catch {
        // User cancelled — ignore
      }
    } else {
      await navigator.clipboard.writeText(url)
      setShareSnackbar(true)
    }
  }

  const { data: rounds, isLoading, error } = useQuery({
    queryKey: ['rounds'],
    queryFn: getRounds,
  })

  const filteredRounds = useMemo(() => {
    if (!rounds) return []
    if (!searchQuery.trim()) return rounds
    const q = searchQuery.trim().toLowerCase()
    return rounds.filter((r) =>
      (r.course?.name ?? '').toLowerCase().includes(q)
    )
  }, [rounds, searchQuery])

  const prefetchRound = (id: string) => {
    queryClient.prefetchQuery({ queryKey: ['round', id], queryFn: () => getRound(id) })
  }

  const handleDelete = async () => {
    if (!confirmRound) return
    setDeleting(true)
    try {
      await deleteRound(confirmRound.id)
      queryClient.invalidateQueries({ queryKey: ['rounds'] })
    } finally {
      setDeleting(false)
      setConfirmRound(null)
    }
  }

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">Failed to load round history.</Alert>
      </Container>
    )
  }

  return (
    <Box>
    <Container maxWidth="md" sx={{ pb: 4 }}>
    <PageHeader title="Round History" subtitle="Every round you've logged, hole by hole" />

      {rounds && rounds.length === 0 && (
        <EmptyState
          icon={<HistoryIcon sx={{ fontSize: 36 }} />}
          title="Your card is blank"
          description="Score your first round and it'll live here forever — every hole, every birdie, every blow-up."
          primary={{ label: 'Start your first round', to: '/play', icon: <SportsGolfIcon /> }}
          secondary={{ label: 'Invite mates', to: '/friends' }}
        />
      )}

      {rounds && rounds.length > 0 && (
        <>
          {/* Search bar */}
          <TextField
            fullWidth
            size="small"
            placeholder="Search by course name…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ mb: 2 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                </InputAdornment>
              ),
              endAdornment: searchQuery ? (
                <InputAdornment position="end">
                  <IconButton aria-label="Clear search" size="small" onClick={() => setSearchQuery('')} edge="end">
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />

          {filteredRounds.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <SearchIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
              <Typography color="text.secondary">No rounds match "{searchQuery}"</Typography>
            </Box>
          ) : (
            <>
              {searchQuery && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  {filteredRounds.length} of {rounds.length} rounds
                </Typography>
              )}
              <Paper elevation={1}>
                <List disablePadding>
                  {filteredRounds.map((round, idx) => {
                    const diff = round.scoreToPar
                    const diffStr =
                      diff == null ? null : diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`
                    // Graded palette: most club golfers live over par, so
                    // reserve red for genuine blow-ups rather than every round.
                    //
                    // Each band names its own foreground rather than assuming
                    // white. Gold is the reason: white on #e0b95c measures
                    // 1.86:1, so the "best round" chip was the least legible
                    // one on the page. It takes the dark ink instead.
                    const chip =
                      diff == null ? { bg: CLAY.inkSoft, fg: '#fff' }
                      : diff < 0 ? { bg: SCORE.under.fill, fg: SCORE.under.on }   // under par — gold
                      : diff === 0 ? { bg: SCORE.even.fill, fg: SCORE.even.on }   // even — green
                      : diff <= 5 ? { bg: SCORE.over.fill, fg: SCORE.over.on }    // modest over par — clay blue
                      : diff <= 12 ? { bg: CLAY.slate, fg: '#fff' }               // typical club score — muted slate
                      : { bg: SCORE.poor.fill, fg: SCORE.poor.on }                // blow-up round — softened red

                    return (
                      <Box key={round.id}>
                        {idx > 0 && <Divider />}
                        {/* The row-actions button used to sit inside the
                            ListItemButton, which nests a <button> in a
                            <button>. Keyboard users could reach the outer
                            control but never the menu. `secondaryAction` puts
                            it in the ListItem as a sibling instead, which is
                            what that prop exists for. */}
                        <ListItem
                          disablePadding
                          secondaryAction={
                            <IconButton
                              size="small"
                              edge="end"
                              onClick={(e) => openRowMenu(e, round)}
                              aria-label={`Actions for the round at ${round.course?.name ? formatCourseName(round.course.name) : 'an unknown course'}`}
                            >
                              <MoreVertIcon fontSize="small" />
                            </IconButton>
                          }
                        >
                          <ListItemButton
                            onClick={() => navigate(`/rounds/${round.id}`)}
                            onMouseEnter={() => prefetchRound(round.id)}
                          >
                            <ListItemText
                              primary={round.course?.name ? formatCourseName(round.course.name) : 'Unknown Course'}
                              secondary={new Date(round.playedAt).toLocaleDateString('en-GB', { dateStyle: 'long' })}
                            />
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 }, mr: 3 }}>
                              {round.totalStrokes != null && (
                                <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
                                  {round.totalStrokes} strokes
                                </Typography>
                              )}
                              {diffStr && (
                                <Chip
                                  label={diffStr}
                                  size="small"
                                  sx={{ bgcolor: chip.bg, color: chip.fg, fontWeight: 700, minWidth: 40 }}
                                />
                              )}
                              {round.holesCompleted != null && round.holesCompleted < (round.course?.holes?.length ?? 18) && (
                                <Typography variant="caption" color="text.secondary">
                                  {round.holesCompleted}/{round.course?.holes?.length ?? 18}
                                </Typography>
                              )}
                            </Box>
                          </ListItemButton>
                        </ListItem>
                      </Box>
                    )
                  })}
                </List>
              </Paper>
            </>
          )}
        </>
      )}

      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={closeRowMenu}>
        {menuRound?.shareId && (
          <MenuItem onClick={() => { const r = menuRound; closeRowMenu(); handleShare(r) }}>
            <ListItemIcon><ShareIcon fontSize="small" /></ListItemIcon>
            Share scorecard
          </MenuItem>
        )}
        <MenuItem onClick={() => { const r = menuRound; closeRowMenu(); if (r) navigate(`/rounds/${r.id}`) }}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          Edit scores
        </MenuItem>
        <MenuItem
          onClick={() => { const r = menuRound; closeRowMenu(); setConfirmRound(r) }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
          Delete round
        </MenuItem>
      </Menu>

      <Dialog open={!!confirmRound} onClose={() => setConfirmRound(null)}>
        <DialogTitle>Delete round?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirmRound && (
              <>
                {confirmRound.course?.name ? formatCourseName(confirmRound.course.name) : 'This round'} on{' '}
                {new Date(confirmRound.playedAt).toLocaleDateString('en-GB', { dateStyle: 'long' })}
                {' '}will be permanently deleted.
              </>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmRound(null)} disabled={deleting}>Cancel</Button>
          <Button color="error" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>

    <Snackbar
      open={shareSnackbar}
      autoHideDuration={2000}
      onClose={() => setShareSnackbar(false)}
      message="Link copied!"
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    />

    {/* Floating action button — quick shortcut to start a new round */}
    <Tooltip title="Start a new round" placement="left">
      <Fab
        color="secondary"
        aria-label="start new round"
        onClick={() => navigate('/play')}
        sx={{
          position: 'fixed',
          bottom: { xs: 76, md: 24 },   // above BottomNav on mobile
          right: 24,
          boxShadow: 4,
        }}
      >
        <AddIcon />
      </Fab>
    </Tooltip>
    </Box>
  )
}
