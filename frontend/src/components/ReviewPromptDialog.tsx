import { useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Button, Typography, TextField, Collapse, Link, Alert,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import StarRating from './StarRating'
import { createReview } from '../api/reviews'

interface ReviewPromptDialogProps {
  open: boolean
  roundId: number
  courseName: string
  onClose: () => void
  onSubmitted?: () => void
  onSkip?: () => void
}

const MAX_TEXT = 500

export default function ReviewPromptDialog({
  open, roundId, courseName, onClose, onSubmitted, onSkip,
}: ReviewPromptDialogProps) {
  const qc = useQueryClient()
  const [rating, setRating] = useState(0)
  const [showDetails, setShowDetails] = useState(false)
  const [conditionRating, setConditionRating] = useState(0)
  const [valueRating, setValueRating] = useState(0)
  const [paceRating, setPaceRating] = useState(0)
  const [text, setText] = useState('')
  const [thanks, setThanks] = useState(false)

  const mutation = useMutation({
    mutationFn: () => createReview(roundId, {
      rating,
      conditionRating: conditionRating || null,
      valueRating: valueRating || null,
      paceRating: paceRating || null,
      text: text.trim() || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feed'] })
      qc.invalidateQueries({ queryKey: ['course-reviews'] })
      qc.invalidateQueries({ queryKey: ['course-review-summary'] })
      setThanks(true)
      onSubmitted?.()
      setTimeout(() => {
        setThanks(false)
        onClose()
      }, 1200)
    },
  })

  const handleSkip = () => {
    localStorage.setItem(`review_skipped_${roundId}`, '1')
    onSkip?.()
    onClose()
  }

  return (
    <Dialog open={open} onClose={(_, reason) => { if (reason !== 'backdropClick') onClose() }} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontFamily: '"Playfair Display", serif' }}>
        How was {courseName}?
      </DialogTitle>
      <DialogContent>
        {thanks ? (
          <Alert severity="success" sx={{ my: 2 }}>Thanks for your review!</Alert>
        ) : (
          <>
            <Box sx={{ textAlign: 'center', my: 2 }}>
              <StarRating value={rating} onChange={setRating} size="large" />
            </Box>

            <Link
              component="button"
              variant="body2"
              onClick={() => setShowDetails((v) => !v)}
              sx={{ display: 'inline-flex', alignItems: 'center', mb: 1 }}
            >
              {showDetails ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              Rate details
            </Link>

            <Collapse in={showDetails}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, my: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2">Course Condition</Typography>
                  <StarRating value={conditionRating} onChange={setConditionRating} size="small" allowClear />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2">Value for Money</Typography>
                  <StarRating value={valueRating} onChange={setValueRating} size="small" allowClear />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2">Pace of Play</Typography>
                  <StarRating value={paceRating} onChange={setPaceRating} size="small" allowClear />
                </Box>
              </Box>
            </Collapse>

            <TextField
              fullWidth
              multiline
              minRows={3}
              maxRows={6}
              placeholder="Any thoughts on the course?"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
              sx={{ mt: 2 }}
              helperText={`${text.length}/${MAX_TEXT}`}
            />

            {mutation.isError && (
              <Alert severity="error" sx={{ mt: 1 }}>Could not submit review. Please try again.</Alert>
            )}
          </>
        )}
      </DialogContent>
      {!thanks && (
        <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
          <Button onClick={handleSkip} color="inherit" disabled={mutation.isPending}>
            Skip
          </Button>
          <Button
            variant="contained"
            onClick={() => mutation.mutate()}
            disabled={rating < 1 || mutation.isPending}
          >
            {mutation.isPending ? 'Submitting…' : 'Submit Review'}
          </Button>
        </DialogActions>
      )}
    </Dialog>
  )
}
