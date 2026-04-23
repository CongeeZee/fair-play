import { useState, useMemo } from 'react'
import { formatCourseName } from '../utils'
import PageHeader from '../components/PageHeader'
import {
  Box, Container, Typography, CircularProgress, Alert,
  List, ListItemButton, ListItemText, Paper, Chip, Divider,
  IconButton, Dialog, DialogTitle, DialogContent, DialogContentText,
  DialogActions, Button, TextField, InputAdornment, Fab, Tooltip
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import HistoryIcon from '@mui/icons-material/History'
import SearchIcon from '@mui/icons-material/Search'
import ClearIcon from '@mui/icons-material/Clear'
import AddIcon from '@mui/icons-material/Add'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRounds, getRound, deleteRound } from '../api/rounds'
import type { Round } from '../types'

export default function HistoryPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmRound, setConfirmRound] = useState<Round | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

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
    <PageHeader title="Round History" />
    <Container maxWidth="md" sx={{ py: 4 }}>

      {rounds && rounds.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <HistoryIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
          <Typography color="text.secondary">No rounds played yet.</Typography>
          <Typography variant="body2" color="text.secondary">
            Head to Courses to start your first round!
          </Typography>
        </Box>
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
                  <IconButton size="small" onClick={() => setSearchQuery('')} edge="end">
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
                    // Under par = good (gold/green), over par = bad (dark blue → red)
                    const chipColor =
                      diff == null ? '#888'
                      : diff < 0 ? '#c9a84c'     // under par — gold
                      : diff === 0 ? '#2d5e42'   // even — green
                      : diff <= 5 ? '#1a3a5c'    // modest over par — dark navy
                      : '#c62828'                // badly over par — red

                    return (
                      <Box key={round.id}>
                        {idx > 0 && <Divider />}
                        <ListItemButton
                          onClick={() => navigate(`/rounds/${round.id}`)}
                          onMouseEnter={() => prefetchRound(round.id)}
                        >
                          <ListItemText
                            primary={round.course?.name ? formatCourseName(round.course.name) : 'Unknown Course'}
                            secondary={new Date(round.playedAt).toLocaleDateString('en-GB', { dateStyle: 'long' })}
                          />
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 } }}>
                            {round.totalStrokes != null && (
                              <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
                                {round.totalStrokes} strokes
                              </Typography>
                            )}
                            {diffStr && (
                              <Chip
                                label={diffStr}
                                size="small"
                                sx={{ bgcolor: chipColor, color: '#fff', fontWeight: 700, minWidth: 40 }}
                              />
                            )}
                            {round.holesCompleted != null && round.holesCompleted < (round.course?.holes?.length ?? 18) && (
                              <Typography variant="caption" color="text.secondary">
                                {round.holesCompleted}/{round.course?.holes?.length ?? 18}
                              </Typography>
                            )}
                            <IconButton
                              size="small"
                              onClick={(e) => { e.stopPropagation(); navigate(`/rounds/${round.id}`) }}
                              aria-label="edit round"
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={(e) => { e.stopPropagation(); setConfirmRound(round) }}
                              aria-label="delete round"
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </ListItemButton>
                      </Box>
                    )
                  })}
                </List>
              </Paper>
            </>
          )}
        </>
      )}

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

    {/* Floating action button — quick shortcut to start a new round */}
    <Tooltip title="Start a new round" placement="left">
      <Fab
        color="secondary"
        aria-label="start new round"
        onClick={() => navigate('/courses')}
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
