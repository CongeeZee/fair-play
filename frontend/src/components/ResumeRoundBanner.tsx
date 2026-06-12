import { Box, Card, CardActionArea, CardContent, Typography, Button, Chip } from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { useNavigate } from 'react-router-dom'
import type { LiveRound } from '../types'
import { formatCourseName } from '../utils'

/**
 * Prominent "you have a round going" banner.
 * Shown when the signed-in user has an in-progress round so they can jump
 * straight back into scoring instead of hunting through History.
 */
export default function ResumeRoundBanner({ round }: { round: LiveRound }) {
  const navigate = useNavigate()
  const toPar =
    round.currentScoreToPar === 0 ? 'E' : round.currentScoreToPar > 0 ? `+${round.currentScoreToPar}` : `${round.currentScoreToPar}`

  return (
    <Card
      sx={{
        mb: 2,
        borderRadius: 2,
        bgcolor: 'primary.main',
        color: '#fff',
      }}
      elevation={3}
    >
      <CardActionArea onClick={() => navigate(`/rounds/${round.roundId}`)}>
        <CardContent sx={{ py: 1.75, px: 2, '&:last-child': { pb: 1.75 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: '#4caf50',
                    flexShrink: 0,
                    animation: 'resumePulse 2s infinite',
                    '@keyframes resumePulse': {
                      '0%': { boxShadow: '0 0 0 0 rgba(76,175,80,0.6)' },
                      '70%': { boxShadow: '0 0 0 6px rgba(76,175,80,0)' },
                      '100%': { boxShadow: '0 0 0 0 rgba(76,175,80,0)' },
                    },
                  }}
                />
                <Typography variant="overline" sx={{ color: 'secondary.main', letterSpacing: 1.5, lineHeight: 1.5 }}>
                  Round in progress
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                {formatCourseName(round.courseName)}
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                Hole {Math.min(round.holesCompleted + 1, round.totalHoles)} of {round.totalHoles}
                {round.holesCompleted > 0 && (
                  <>
                    {' · '}
                    <Chip
                      label={toPar}
                      size="small"
                      sx={{ height: 16, fontSize: '0.65rem', fontWeight: 700, bgcolor: 'rgba(255,255,255,0.15)', color: '#fff' }}
                    />
                  </>
                )}
              </Typography>
            </Box>
            <Button
              variant="contained"
              color="secondary"
              size="small"
              startIcon={<PlayArrowIcon />}
              component="span"
              sx={{ flexShrink: 0, fontWeight: 700, pointerEvents: 'none' }}
            >
              Resume
            </Button>
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  )
}
