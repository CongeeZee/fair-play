import { useState } from 'react'
import {
  Box, Typography, Card, CardContent, CardActionArea, Button, Chip,
  CircularProgress, Divider, TextField, InputAdornment,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import PersonIcon from '@mui/icons-material/Person'
import GolfCourseIcon from '@mui/icons-material/GolfCourse'
import AddIcon from '@mui/icons-material/Add'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getTeeTimes } from '../api/teetimes'
import PageHeader from '../components/PageHeader'

function relativeDate(dt: string): string {
  const d = new Date(dt)
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  const dayOfWeek = d.toLocaleDateString('en-AU', { weekday: 'long' })
  if (diffDays <= 6) return `This ${dayOfWeek}`
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function PlayPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  const { data } = useQuery({
    queryKey: ['teetimes'],
    queryFn: getTeeTimes,
    staleTime: 60_000,
  })

  const myUpcoming = data?.myUpcoming?.slice(0, 3) ?? []
  const invitations = data?.invitations?.slice(0, 3) ?? []
  const hasTeeTimeContent = myUpcoming.length > 0 || invitations.length > 0
  const totalUpcoming = (data?.myUpcoming?.length ?? 0) + (data?.invitations?.length ?? 0)

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto' }}>
      <PageHeader title="Play" subtitle="Find a course or organise a round" />

      {/* Tee Times Section */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Upcoming Rounds</Typography>
          <Button size="small" onClick={() => navigate('/teetimes')} endIcon={<ArrowForwardIcon />} sx={{ textTransform: 'none', fontSize: '0.8rem' }}>
            {totalUpcoming > 3 ? 'See all' : 'Manage'}
          </Button>
        </Box>

        {invitations.length > 0 && invitations.map((tt) => (
          <Card key={tt.id} variant="outlined" sx={{ mb: 1, borderRadius: 2, borderColor: '#1a3a5c', borderWidth: 2 }}>
            <CardActionArea onClick={() => navigate(`/teetimes/${tt.id}`)}>
              <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{tt.courseName || 'Course TBD'}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {relativeDate(tt.dateTime)} · from {tt.creatorName}
                    </Typography>
                  </Box>
                  <Chip label="Invited" size="small" sx={{ bgcolor: '#1a3a5c', color: '#fff', fontWeight: 700, fontSize: '0.65rem', height: 22 }} />
                </Box>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}

        {myUpcoming.map((tt) => (
          <Card key={tt.id} variant="outlined" sx={{ mb: 1, borderRadius: 2 }}>
            <CardActionArea onClick={() => navigate(`/teetimes/${tt.id}`)}>
              <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{tt.courseName || 'Course TBD'}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {relativeDate(tt.dateTime)} · {new Date(tt.dateTime).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })} · {tt.spotsFilled}/{tt.spotsTotal}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {tt.participants.filter(p => p.status === 'CONFIRMED').slice(0, 2).map((p) => (
                      <Chip key={p.userId} label={p.name.split(' ')[0]} size="small" sx={{ height: 20, fontSize: '0.65rem' }} />
                    ))}
                  </Box>
                </Box>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}

        {!hasTeeTimeContent && (
          <Card variant="outlined" sx={{ borderRadius: 2, borderStyle: 'dashed' }}>
            <CardContent sx={{ py: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>No upcoming rounds</Typography>
              <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => navigate('/teetimes')} sx={{ textTransform: 'none' }}>
                Create Tee Time
              </Button>
            </CardContent>
          </Card>
        )}
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* Course Search Section */}
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Find a Course</Typography>
        <TextField
          fullWidth
          size="small"
          placeholder="Search courses..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && search.trim()) {
              navigate(`/courses?search=${encodeURIComponent(search.trim())}`)
            }
          }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                </InputAdornment>
              ),
            },
          }}
          sx={{ mb: 1.5 }}
        />
        <Button
          fullWidth
          variant="contained"
          startIcon={<GolfCourseIcon />}
          onClick={() => navigate(search.trim() ? `/courses?search=${encodeURIComponent(search.trim())}` : '/courses')}
          sx={{ textTransform: 'none' }}
        >
          {search.trim() ? `Search "${search.trim()}"` : 'Browse Courses'}
        </Button>
      </Box>
    </Box>
  )
}
