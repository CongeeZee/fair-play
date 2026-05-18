import { useState } from 'react'
import {
  Box, Card, CardContent, Typography, ToggleButtonGroup, ToggleButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  CircularProgress, Button,
} from '@mui/material'
import TrendingDownIcon from '@mui/icons-material/TrendingDown'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import RemoveIcon from '@mui/icons-material/Remove'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getLeaderboard, getHandicapLeaderboard } from '../api/rounds'
import { useAuth } from '../contexts/AuthContext'

function formatScore(val: number | null) {
  if (val == null) return '—'
  if (val === 0) return 'E'
  return val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1)
}

function formatScoreInt(val: number | null) {
  if (val == null) return '—'
  if (val === 0) return 'E'
  return val > 0 ? `+${val}` : `${val}`
}

export default function LeaderboardSection() {
  const { user } = useAuth()
  const [timeframe, setTimeframe] = useState('month')

  const { data: scoreBoard, isLoading: scoreLoading } = useQuery({
    queryKey: ['leaderboard', timeframe],
    queryFn: () => getLeaderboard(timeframe),
  })

  const { data: handicapBoard, isLoading: handicapLoading } = useQuery({
    queryKey: ['leaderboard-handicap'],
    queryFn: getHandicapLeaderboard,
  })

  // If only the current user (no friends), show prompt
  const hasFriends = (scoreBoard?.length ?? 0) > 1

  if (scoreLoading && handicapLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box>
  }

  if (!hasFriends && !scoreLoading) {
    return (
      <Card elevation={1} sx={{ mb: 4 }}>
        <CardContent sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Add friends to see leaderboards
          </Typography>
          <Button variant="outlined" component={Link} to="/friends" size="small">
            Find Friends
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Box sx={{ mb: 4 }}>
      {/* Score Leaderboard */}
      <Card elevation={1} sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" color="primary.main" gutterBottom>
            Score Leaderboard
          </Typography>

          <ToggleButtonGroup
            value={timeframe}
            exclusive
            onChange={(_, v) => v && setTimeframe(v)}
            size="small"
            sx={{ mb: 2 }}
          >
            <ToggleButton value="week">This Week</ToggleButton>
            <ToggleButton value="month">This Month</ToggleButton>
            <ToggleButton value="all">All Time</ToggleButton>
          </ToggleButtonGroup>

          {scoreLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, width: 40 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                    <TableCell sx={{ fontWeight: 700, display: { xs: 'none', sm: 'table-cell' } }}>Rounds</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Best</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Avg</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {scoreBoard?.map((entry, i) => {
                    const isMe = String(entry.userId) === user?.id
                    return (
                      <TableRow
                        key={entry.userId}
                        sx={isMe ? { bgcolor: 'rgba(201, 168, 76, 0.1)' } : undefined}
                      >
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {i === 0 && entry.avgScoreToPar !== null && (
                              <EmojiEventsIcon sx={{ fontSize: 16, color: '#c9a84c' }} />
                            )}
                            {i + 1}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontWeight: isMe ? 700 : 400 }}>
                          {entry.name}{isMe ? ' (you)' : ''}
                        </TableCell>
                        <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                          {entry.roundsPlayed}
                        </TableCell>
                        <TableCell align="right">{formatScoreInt(entry.bestScoreToPar)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                          {formatScore(entry.avgScoreToPar)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* Handicap Leaderboard */}
      <Card elevation={1}>
        <CardContent>
          <Typography variant="h6" color="primary.main" gutterBottom>
            Handicap Leaderboard
          </Typography>

          {handicapLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, width: 40 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Handicap</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 50 }} align="center">Trend</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {handicapBoard?.map((entry, i) => {
                    const isMe = String(entry.userId) === user?.id
                    return (
                      <TableRow
                        key={entry.userId}
                        sx={isMe ? { bgcolor: 'rgba(201, 168, 76, 0.1)' } : undefined}
                      >
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {i === 0 && entry.handicapIndex !== null && (
                              <EmojiEventsIcon sx={{ fontSize: 16, color: '#c9a84c' }} />
                            )}
                            {i + 1}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontWeight: isMe ? 700 : 400 }}>
                          {entry.name}{isMe ? ' (you)' : ''}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                          {entry.handicapIndex != null ? entry.handicapIndex.toFixed(1) : '—'}
                        </TableCell>
                        <TableCell align="center">
                          {entry.trend === 'improving' && <TrendingDownIcon sx={{ fontSize: 18, color: '#2d5e42' }} />}
                          {entry.trend === 'declining' && <TrendingUpIcon sx={{ fontSize: 18, color: '#c62828' }} />}
                          {entry.trend === 'stable' && <RemoveIcon sx={{ fontSize: 18, color: '#999' }} />}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}
