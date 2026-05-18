import { useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField,
  Box, Typography, CircularProgress, Alert,
} from '@mui/material'
import { linkHandicap } from '../api/rounds'

interface Props {
  open: boolean
  onClose: () => void
  onLinked: () => void
}

export default function LinkHandicapDialog({ open, onClose, onLinked }: Props) {
  const [manualIndex, setManualIndex] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleClose = () => {
    setManualIndex('')
    setError('')
    setLoading(false)
    onClose()
  }

  const handleLink = async () => {
    setError('')
    const idx = parseFloat(manualIndex)
    if (isNaN(idx) || idx < -10 || idx > 54) {
      setError('Enter a valid handicap index (-10 to 54)')
      return
    }

    setLoading(true)
    try {
      await linkHandicap({ source: 'manual', handicapIndex: idx })
      onLinked()
      handleClose()
    } catch {
      setError('Failed to save. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Link Official Handicap</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          Enter your official handicap index from your golf club or national authority. You can find this in your club's app, the Golf Australia app, GHIN app, or your club's website.
        </Typography>

        <TextField
          fullWidth
          label="Handicap Index"
          placeholder="12.4"
          value={manualIndex}
          onChange={(e) => { setManualIndex(e.target.value); setError('') }}
          inputProps={{ inputMode: 'decimal' }}
          helperText="You can update this anytime as your official handicap changes"
        />

        <Box sx={{ mt: 2, p: 1.5, bgcolor: 'rgba(0,0,0,0.03)', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Your linked handicap is shown alongside the one Fairplay calculates from your rounds. It won't override your calculated handicap — both are displayed so you can compare.
          </Typography>
        </Box>

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleLink}
          disabled={loading || !manualIndex}
        >
          {loading ? <CircularProgress size={20} /> : 'Link Handicap'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
