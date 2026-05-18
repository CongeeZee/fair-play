import { useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, ToggleButtonGroup, ToggleButton,
  Box, Typography, CircularProgress, Alert, Chip,
} from '@mui/material'
import { lookupGolfAustralia, lookupGHIN, linkHandicap } from '../api/rounds'
import type { HandicapLookupResult } from '../types'

type Source = 'golf_australia' | 'ghin' | 'manual'

interface Props {
  open: boolean
  onClose: () => void
  onLinked: () => void
}

export default function LinkHandicapDialog({ open, onClose, onLinked }: Props) {
  const [source, setSource] = useState<Source>('golf_australia')
  const [externalId, setExternalId] = useState('')
  const [manualIndex, setManualIndex] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lookupResult, setLookupResult] = useState<HandicapLookupResult | null>(null)

  const reset = () => {
    setExternalId('')
    setManualIndex('')
    setError('')
    setLookupResult(null)
    setLoading(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSourceChange = (_: unknown, val: Source | null) => {
    if (val) {
      setSource(val)
      reset()
    }
  }

  const handleLookup = async () => {
    setError('')
    setLookupResult(null)
    setLoading(true)

    try {
      let result: HandicapLookupResult
      if (source === 'golf_australia') {
        result = await lookupGolfAustralia(externalId)
      } else {
        result = await lookupGHIN(externalId)
      }
      setLookupResult(result)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || 'Lookup failed. Check the number and try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleLink = async () => {
    setError('')
    setLoading(true)

    try {
      if (source === 'manual') {
        const idx = parseFloat(manualIndex)
        if (isNaN(idx) || idx < -10 || idx > 54) {
          setError('Enter a valid handicap index (-10 to 54)')
          setLoading(false)
          return
        }
        await linkHandicap({ source, handicapIndex: idx })
      } else if (lookupResult) {
        await linkHandicap({
          source,
          externalId,
          handicapIndex: lookupResult.handicapIndex,
          playerName: lookupResult.playerName,
          clubName: lookupResult.clubName,
        })
      }
      onLinked()
      handleClose()
    } catch {
      setError('Failed to save. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const idLabel = source === 'golf_australia' ? 'Golf ID (10 digits)' : 'GHIN Number (7-8 digits)'
  const idPlaceholder = source === 'golf_australia' ? '3160103578' : '1234567'
  const canLookup = source !== 'manual' && externalId.length >= 7

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Link Official Handicap</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          Link your official handicap index from your national golf authority.
        </Typography>

        <ToggleButtonGroup
          value={source}
          exclusive
          onChange={handleSourceChange}
          size="small"
          fullWidth
          sx={{ mb: 3 }}
        >
          <ToggleButton value="golf_australia">
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>Australia</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>Golf Australia</Typography>
            </Box>
          </ToggleButton>
          <ToggleButton value="ghin">
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>USA</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>GHIN / USGA</Typography>
            </Box>
          </ToggleButton>
          <ToggleButton value="manual">
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>Other</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>Manual entry</Typography>
            </Box>
          </ToggleButton>
        </ToggleButtonGroup>

        {source !== 'manual' ? (
          <>
            <TextField
              fullWidth
              label={idLabel}
              placeholder={idPlaceholder}
              value={externalId}
              onChange={(e) => { setExternalId(e.target.value); setLookupResult(null); setError('') }}
              sx={{ mb: 2 }}
              inputProps={{ inputMode: 'numeric' }}
            />
            <Button
              variant="outlined"
              onClick={handleLookup}
              disabled={!canLookup || loading}
              fullWidth
              sx={{ mb: 2 }}
            >
              {loading ? <CircularProgress size={20} /> : 'Look Up Handicap'}
            </Button>

            {lookupResult && (
              <Box sx={{ p: 2, bgcolor: 'rgba(45,94,66,0.08)', borderRadius: 2, border: '1px solid rgba(45,94,66,0.2)' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                  <Typography variant="h4" sx={{ fontWeight: 800, color: 'primary.main' }}>
                    {lookupResult.handicapIndex.toFixed(1)}
                  </Typography>
                  <Chip label="Official" size="small" color="success" />
                </Box>
                {lookupResult.playerName && (
                  <Typography variant="body2">{lookupResult.playerName}</Typography>
                )}
                {lookupResult.clubName && (
                  <Typography variant="caption" color="text.secondary">{lookupResult.clubName}</Typography>
                )}
              </Box>
            )}
          </>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              For golfers in the UK, Europe, Asia, or other WHS regions — enter your current handicap index manually.
            </Typography>
            <TextField
              fullWidth
              label="Handicap Index"
              placeholder="12.4"
              value={manualIndex}
              onChange={(e) => { setManualIndex(e.target.value); setError('') }}
              inputProps={{ inputMode: 'decimal' }}
              helperText="You can update this anytime from your official app or club portal"
            />
          </>
        )}

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleLink}
          disabled={loading || (source !== 'manual' && !lookupResult) || (source === 'manual' && !manualIndex)}
        >
          {loading ? <CircularProgress size={20} /> : 'Link Handicap'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
