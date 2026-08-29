import { Box, Card, CardActionArea, CardContent, Typography, Button, Chip } from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { useNavigate } from 'react-router-dom'
import type { LiveRound } from '../types'
import { formatCourseName } from '../utils'
import { ON_GREEN } from '../scoreColors'
import { CLAY } from '../theme'

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
                    bgcolor: '#63b47f',
                    flexShrink: 0,
                    animation: 'resumePulse 2s infinite',
                    '@keyframes resumePulse': {
                      '0%': { boxShadow: '0 0 0 0 rgba(99,180,127,0.6)' },
                      '70%': { boxShadow: '0 0 0 6px rgba(99,180,127,0)' },
                      '100%': { boxShadow: '0 0 0 0 rgba(99,180,127,0)' },
                    },
                  }}
                />
                {/* `secondary.main` is the raw gold, which measures 3.38:1 on the green
                    card — the pale on-green step is needed here instead. */}
                <Typography variant="overline" sx={{ color: ON_GREEN.gold, letterSpacing: 1.5, lineHeight: 1.5 }}>
                  Round in progress
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                {formatCourseName(round.courseName)}
              </Typography>
              {/* 70% white flattens to #c1d3c9 on the green — 4.03:1, just under AA.
                  The named on-green step is 5.28:1. */}
              <Typography variant="caption" sx={{ color: ON_GREEN.soft }}>
                Hole {Math.min(round.holesCompleted + 1, round.totalHoles)} of {round.totalHoles}
                {round.holesCompleted > 0 && (
                  <>
                    {' · '}
                    <Chip
                      label={toPar}
                      size="small"
                      sx={{ height: 16, fontSize: '0.65rem', fontWeight: 700, bgcolor: ON_GREEN.soft, color: CLAY.greenDark }}
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
              // `component="span"` stops this being a <button> inside a <button>,
              // but MUI's ButtonBase still gives a non-button element role=button
              // and tabindex=0 — so it was still a focusable control nested in
              // one. It is decoration: the whole card is the real target.
              tabIndex={-1}
              role={undefined}
              aria-hidden
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
