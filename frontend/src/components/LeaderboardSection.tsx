import { useState } from 'react'
import {
  Box, Card, CardContent, Typography, ToggleButtonGroup, ToggleButton,
  CircularProgress, Button, ButtonBase,
} from '@mui/material'
import TrendingDownIcon from '@mui/icons-material/TrendingDown'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import RemoveIcon from '@mui/icons-material/Remove'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getLeaderboard, getHandicapLeaderboard } from '../api/rounds'
import { useAuth } from '../contexts/AuthContext'
import { CLAY, tint } from '../theme'
import UserAvatar from './UserAvatar'
import { formatHandicap } from '../utils'

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
  const navigate = useNavigate()
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
          <Button variant="outlined" component={Link} to="/friends?tab=add" size="small">
            Find Friends
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Box sx={{ mb: 4 }}>
      {/* Score leaderboard */}
      <Card elevation={1} sx={{ mb: 3 }}>
        <CardContent sx={{ pb: '8px !important' }}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>Scoring</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Average over full rounds · best in brackets
          </Typography>
          <ToggleButtonGroup
            value={timeframe}
            exclusive
            onChange={(_, v) => v && setTimeframe(v)}
            size="small"
            sx={{ mb: 1.5 }}
          >
            <ToggleButton value="week">Week</ToggleButton>
            <ToggleButton value="month">Month</ToggleButton>
            <ToggleButton value="all">All time</ToggleButton>
          </ToggleButtonGroup>

          {scoreLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>
          ) : (
            <Box>
              {scoreBoard?.map((entry, i) => (
                <RankRow
                  key={entry.userId}
                  rank={i + 1}
                  leader={i === 0 && entry.avgScoreToPar !== null}
                  userId={entry.userId}
                  name={entry.name}
                  isMe={String(entry.userId) === String(user?.id)}
                  sub={`${entry.roundsPlayed} round${entry.roundsPlayed === 1 ? '' : 's'}`}
                  value={formatScore(entry.avgScoreToPar)}
                  valueSub={entry.bestScoreToPar != null ? `(${formatScoreInt(entry.bestScoreToPar)})` : undefined}
                  onClick={() => navigate(`/profile/${entry.userId}`)}
                />
              ))}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Handicap leaderboard */}
      <Card elevation={1}>
        <CardContent sx={{ pb: '8px !important' }}>
          <Typography variant="h6" sx={{ mb: 1.5 }}>Handicap</Typography>
          {handicapLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>
          ) : (
            <Box>
              {handicapBoard?.map((entry, i) => (
                <RankRow
                  key={entry.userId}
                  rank={i + 1}
                  leader={i === 0 && entry.handicapIndex !== null}
                  userId={entry.userId}
                  name={entry.name}
                  isMe={String(entry.userId) === String(user?.id)}
                  sub={entry.trend === 'improving' ? 'Improving' : entry.trend === 'declining' ? 'Going up' : entry.trend === 'stable' ? 'Steady' : undefined}
                  trend={entry.trend}
                  value={entry.handicapIndex != null ? formatHandicap(entry.handicapIndex) : '—'}
                  onClick={() => navigate(`/profile/${entry.userId}`)}
                />
              ))}
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}

function RankRow({ rank, leader, userId, name, isMe, sub, value, valueSub, trend, onClick }: {
  rank: number
  leader: boolean
  userId: number
  name: string
  isMe: boolean
  sub?: string
  value: string
  valueSub?: string
  trend?: 'improving' | 'declining' | 'stable' | null
  onClick: () => void
}) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 1.5, py: 1, px: 1, borderRadius: 3,
        textAlign: 'left',
        bgcolor: isMe ? tint(CLAY.gold, 0.14) : 'transparent',
        '&:hover': { bgcolor: isMe ? tint(CLAY.gold, 0.2) : 'action.hover' },
      }}
    >
      <Box sx={{ width: 24, textAlign: 'center', flexShrink: 0 }}>
        {leader
          ? <EmojiEventsIcon titleAccess="Leader" sx={{ fontSize: 20, color: CLAY.goldGraphic, display: 'block', mx: 'auto' }} />
          : <Typography className="tabular" sx={{ fontWeight: 700, color: 'text.secondary' }}>{rank}</Typography>}
      </Box>
      <UserAvatar userId={userId} name={name} size={36} link={false} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: isMe ? 700 : 600 }} noWrap>{isMe ? 'You' : name}</Typography>
        {sub && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {/* The arrow is decorative here — the word carries the trend */}
            {trend === 'improving' && <TrendingDownIcon sx={{ fontSize: 14, color: CLAY.successText }} />}
            {trend === 'declining' && <TrendingUpIcon sx={{ fontSize: 14, color: CLAY.errorText }} />}
            {trend === 'stable' && <RemoveIcon sx={{ fontSize: 14 }} />}
            {sub}
          </Typography>
        )}
      </Box>
      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
        <Typography className="tabular" sx={{ fontWeight: 800, fontSize: '1.05rem' }}>{value}</Typography>
        {valueSub && <Typography variant="caption" color="text.secondary" className="tabular">{valueSub}</Typography>}
      </Box>
    </ButtonBase>
  )
}
