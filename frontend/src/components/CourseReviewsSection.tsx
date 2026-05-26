import { useState } from 'react'
import {
  Box, Paper, Typography, LinearProgress, Chip, Divider, Button, Alert, CircularProgress,
} from '@mui/material'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import StarRating from './StarRating'
import ProfileLink from './ProfileLink'
import ReviewPromptDialog from './ReviewPromptDialog'
import { getCourseReviews } from '../api/reviews'

interface CourseReviewsSectionProps {
  courseId: string | number
  promptableRound?: { roundId: number; courseName: string } | null
}

function scoreToParBadge(stp: number | null) {
  if (stp == null) return null
  const label = stp === 0 ? 'E' : stp > 0 ? `+${stp}` : `${stp}`
  const color = stp < 0 ? '#c9a84c' : stp === 0 ? '#2d5e42' : stp <= 5 ? '#e6a817' : '#c62828'
  return (
    <Chip
      label={label}
      size="small"
      sx={{ height: 20, fontSize: '0.7rem', bgcolor: color, color: '#fff', fontWeight: 700 }}
    />
  )
}

export default function CourseReviewsSection({ courseId, promptableRound }: CourseReviewsSectionProps) {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [promptOpen, setPromptOpen] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['course-reviews', String(courseId), page],
    queryFn: () => getCourseReviews(courseId, page, 10),
  })

  if (isLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box>
  }
  if (error || !data) {
    return <Alert severity="error">Failed to load reviews.</Alert>
  }

  const dist = data.ratingDistribution
  const distTotal = data.totalReviews || 1
  const subs = [
    { label: 'Condition', value: data.averageCondition },
    { label: 'Value', value: data.averageValue },
    { label: 'Pace', value: data.averagePace },
  ].filter((s) => s.value != null)

  return (
    <Box>
      {promptableRound && (
        <Paper elevation={1} sx={{ p: 2, mb: 2, bgcolor: 'rgba(201, 168, 76, 0.08)', border: '1px solid rgba(201,168,76,0.3)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>Leave a review</Typography>
              <Typography variant="body2" color="text.secondary">
                Share what you thought of your last round here.
              </Typography>
            </Box>
            <Button variant="contained" onClick={() => setPromptOpen(true)}>
              Review
            </Button>
          </Box>
        </Paper>
      )}

      <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
        {data.totalReviews === 0 ? (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <Typography color="text.secondary">No reviews yet.</Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 3, alignItems: { sm: 'center' } }}>
            <Box sx={{ textAlign: 'center', minWidth: 120 }}>
              <Typography variant="h3" fontWeight={700} color="primary.main">
                {data.averageRating?.toFixed(1)}
              </Typography>
              <StarRating value={data.averageRating} readOnly size="small" />
              <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
                {data.totalReviews} review{data.totalReviews === 1 ? '' : 's'}
              </Typography>
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {[5, 4, 3, 2, 1].map((n) => {
                const count = dist[n] || 0
                const pct = (count / distTotal) * 100
                return (
                  <Box key={n} sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 0.25 }}>
                    <Typography variant="caption" sx={{ width: 16 }}>{n}</Typography>
                    <Box sx={{ flex: 1 }}>
                      <LinearProgress
                        variant="determinate"
                        value={pct}
                        sx={{ height: 8, borderRadius: 4, bgcolor: 'action.hover',
                          '& .MuiLinearProgress-bar': { bgcolor: '#c9a84c' } }}
                      />
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ width: 30, textAlign: 'right' }}>
                      {count}
                    </Typography>
                  </Box>
                )
              })}
            </Box>
          </Box>
        )}

        {subs.length > 0 && data.totalReviews >= 3 && (
          <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center', mt: 2, flexWrap: 'wrap' }}>
            {subs.map((s) => (
              <Box key={s.label} sx={{ textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary" display="block">{s.label}</Typography>
                <Typography variant="subtitle2" fontWeight={700}>{s.value!.toFixed(1)}</Typography>
                <StarRating value={s.value} readOnly size="small" />
              </Box>
            ))}
          </Box>
        )}
      </Paper>

      {data.reviews.map((r) => (
        <Paper key={r.id} elevation={1} sx={{ p: 2, mb: 1.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 0.5 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <ProfileLink userId={r.userId} name={r.userName} />
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
                <StarRating value={r.rating} readOnly size="small" />
                <Typography variant="caption" color="text.secondary">
                  Played {new Date(r.playedAt).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
                </Typography>
              </Box>
            </Box>
            {scoreToParBadge(r.scoreToPar)}
          </Box>
          {(r.conditionRating || r.valueRating || r.paceRating) && (
            <Box sx={{ display: 'flex', gap: 2, my: 1, flexWrap: 'wrap' }}>
              {r.conditionRating && (
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">Condition</Typography>
                  <StarRating value={r.conditionRating} readOnly size="small" />
                </Box>
              )}
              {r.valueRating && (
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">Value</Typography>
                  <StarRating value={r.valueRating} readOnly size="small" />
                </Box>
              )}
              {r.paceRating && (
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">Pace</Typography>
                  <StarRating value={r.paceRating} readOnly size="small" />
                </Box>
              )}
            </Box>
          )}
          {r.text && (
            <>
              <Divider sx={{ my: 1 }} />
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{r.text}</Typography>
            </>
          )}
        </Paper>
      ))}

      {data.totalReviews > page * 10 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          <Button onClick={() => setPage((p) => p + 1)}>Load more</Button>
        </Box>
      )}

      {promptableRound && (
        <ReviewPromptDialog
          open={promptOpen}
          roundId={promptableRound.roundId}
          courseName={promptableRound.courseName}
          onClose={() => {
            setPromptOpen(false)
            qc.invalidateQueries({ queryKey: ['course-reviews', String(courseId)] })
          }}
        />
      )}

    </Box>
  )
}
