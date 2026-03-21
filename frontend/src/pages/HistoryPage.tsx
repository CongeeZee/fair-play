import { useState } from 'react'
import { formatCourseName } from '../utils'
import {
  Box, Container, Typography, CircularProgress, Alert,
  List, ListItemButton, ListItemText, Paper, Chip, Divider,
  IconButton, Dialog, DialogTitle, DialogContent, DialogContentText,
  DialogActions, Button
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import HistoryIcon from '@mui/icons-material/History'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRounds, deleteRound } from '../api/rounds'
import type { Round } from '../types'

export default function HistoryPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmRound, setConfirmRound] = useState<Round | null>(null)
  const [deleting, setDeleting] = useState(false)

  const { data: rounds, isLoading, error } = useQuery({
    queryKey: ['rounds'],
    queryFn: getRounds,
  })

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
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" color="primary.main" gutterBottom>
        Round History
      </Typography>

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
        <Paper elevation={1}>
          <List disablePadding>
            {rounds.map((round, idx) => {
              const diff = round.scoreToPar
              const diffStr =
                diff == null ? null : diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`
              const chipColor =
                diff == null ? 'default'
                : diff < 0 ? '#c62828'
                : diff === 0 ? '#2d5e42'
                : diff <= 5 ? '#1a3a5c'
                : '#1a3a5c'

              return (
                <Box key={round.id}>
                  {idx > 0 && <Divider />}
                  <ListItemButton onClick={() => navigate(`/rounds/${round.id}`)}>
                    <ListItemText
                      primary={round.course?.name ? formatCourseName(round.course.name) : 'Unknown Course'}
                      secondary={new Date(round.playedAt).toLocaleDateString('en-GB', { dateStyle: 'long' })}
                    />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      {round.totalStrokes != null && (
                        <Typography variant="body2" color="text.secondary">
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
                          {round.holesCompleted}/{round.course?.holes?.length ?? 18} holes
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
  )
}
