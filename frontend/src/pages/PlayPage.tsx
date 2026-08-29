import { useState, useEffect } from 'react'
import {
  Box, Typography, Card, CardContent, CardActionArea, Button, Chip,
  Divider, CircularProgress, Alert, RadioGroup, FormControlLabel, Radio,
  FormControl,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getTeeTimes } from '../api/teetimes'
import { getExternalCourseTees } from '../api/courses'
import { createRound } from '../api/rounds'
import { capture, AnalyticsEvent } from '../analytics'
import PageHeader from '../components/PageHeader'
import CourseSearchInput, { type CourseSearchResult } from '../components/CourseSearchInput'
import ResumeRoundBanner from '../components/ResumeRoundBanner'
import { getLiveRounds } from '../api/live'
import { CLAY, raised, tint } from '../theme'

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
  const [selectedCourse, setSelectedCourse] = useState<CourseSearchResult | null>(null)
  const [selectedTee, setSelectedTee] = useState<string>('')

  const { data } = useQuery({
    queryKey: ['teetimes'],
    queryFn: getTeeTimes,
    staleTime: 60_000,
  })

  // Surface an in-progress round so "Play" resumes it rather than burying it
  const { data: liveData } = useQuery({
    queryKey: ['live-rounds'],
    queryFn: getLiveRounds,
    staleTime: 30_000,
  })

  // Fetch tees when an external course is selected
  const teesQuery = useQuery({
    queryKey: ['external-course-tees', selectedCourse?.id],
    queryFn: () => getExternalCourseTees(selectedCourse!.id),
    enabled: !!selectedCourse && selectedCourse.source === 'external',
  })

  const startRoundMut = useMutation({
    mutationFn: async () => {
      if (!selectedCourse) throw new Error('No course selected')
      if (selectedCourse.source === 'external') {
        return createRound({ externalCourseId: selectedCourse.id, teeName: selectedTee })
      }
      return createRound({ courseId: selectedCourse.id })
    },
    onSuccess: (round) => {
      capture(AnalyticsEvent.RoundStarted, {
        courseId: selectedCourse?.source === 'local' ? Number(selectedCourse.id) : undefined,
        externalCourseId: selectedCourse?.source === 'external' ? selectedCourse.id : undefined,
      })
      navigate(`/rounds/${round.id}`)
    },
  })

  const handleSelectCourse = (c: CourseSearchResult) => {
    setSelectedCourse(c)
    setSelectedTee('')
  }

  const handleClearCourse = () => {
    setSelectedCourse(null)
    setSelectedTee('')
  }

  const myUpcoming = data?.myUpcoming?.slice(0, 3) ?? []
  const invitations = data?.invitations?.slice(0, 3) ?? []
  const hasTeeTimeContent = myUpcoming.length > 0 || invitations.length > 0
  const totalUpcoming = (data?.myUpcoming?.length ?? 0) + (data?.invitations?.length ?? 0)

  // Default the tee selection to the first one once loaded
  useEffect(() => {
    if (teesQuery.data && teesQuery.data.tees.length > 0 && !selectedTee) {
      setSelectedTee(teesQuery.data.tees[0].name)
    }
  }, [teesQuery.data, selectedTee])

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', px: 2, pb: 3 }}>
      <PageHeader title="Play" subtitle="Find a course or organise a round" />

      {liveData?.ownLiveRound && <ResumeRoundBanner round={liveData.ownLiveRound} />}

      {/* Tee Times Section */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Upcoming Rounds</Typography>
          <Button size="small" onClick={() => navigate('/teetimes')} endIcon={<ArrowForwardIcon />} sx={{ textTransform: 'none', fontSize: '0.8rem' }}>
            {totalUpcoming > 3 ? 'See all' : 'Manage'}
          </Button>
        </Box>

        {invitations.length > 0 && invitations.map((tt) => (
          // Gold, not the info blue: "invited" is the same needs-your-attention
          // state the feed sidebar already flags in gold, and a hard navy rule
          // is the one thing on the page that reads as a drawn border.
          <Card
            key={tt.id}
            elevation={2}
            sx={{
              mb: 1,
              borderRadius: 2,
              bgcolor: tint(CLAY.gold, 0.16),
              boxShadow: `${raised(3)}, 0 0 0 2px rgba(224,185,92,0.45)`,
            }}
          >
            <CardActionArea onClick={() => navigate(`/teetimes/${tt.id}`)}>
              <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{tt.courseName || 'Course TBD'}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {relativeDate(tt.dateTime)} · from {tt.creatorName}
                    </Typography>
                  </Box>
                  <Chip label="Invited" size="small" sx={{ bgcolor: CLAY.gold, color: '#3a2f12', fontWeight: 700, fontSize: '0.65rem', height: 22 }} />
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

      {/* Course Search Section — fully inline, never navigates away */}
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Start a Round</Typography>

        {!selectedCourse && (
          <CourseSearchInput
            source="external"
            variant="inline"
            placeholder="Search any course worldwide…"
            onSelect={handleSelectCourse}
          />
        )}

        {selectedCourse && (
          <Card variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent sx={{ py: 2, px: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                    {selectedCourse.name}
                  </Typography>
                  {selectedCourse.subtitle && (
                    <Typography variant="caption" color="text.secondary">
                      {selectedCourse.subtitle}
                    </Typography>
                  )}
                </Box>
                <Button size="small" onClick={handleClearCourse} sx={{ textTransform: 'none', ml: 1 }}>
                  Change
                </Button>
              </Box>

              {selectedCourse.source === 'external' && teesQuery.isLoading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                  <CircularProgress size={22} />
                </Box>
              )}

              {selectedCourse.source === 'external' && teesQuery.error && (
                <Alert severity="error" sx={{ my: 1 }}>Could not load tees for this course.</Alert>
              )}

              {selectedCourse.source === 'external' && teesQuery.data && teesQuery.data.tees.length > 0 && (
                <>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    Tees
                  </Typography>
                  <FormControl component="fieldset" fullWidth>
                    <RadioGroup
                      value={selectedTee}
                      onChange={(e) => setSelectedTee(e.target.value)}
                    >
                      {teesQuery.data.tees.map((tee, i) => (
                        <FormControlLabel
                          key={`${tee.name}-${i}`}
                          value={tee.name}
                          control={<Radio size="small" />}
                          label={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body2">
                                {tee.name.split(',').map(s => s.trim()).filter(s => !/^\d+$/.test(s) && s.toUpperCase() !== 'USGA').join(' ')}
                              </Typography>
                              <Chip label={`${tee.totalYards} yds`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                              <Typography variant="caption" color="text.secondary">
                                Par {tee.parTotal}
                              </Typography>
                            </Box>
                          }
                        />
                      ))}
                    </RadioGroup>
                  </FormControl>
                </>
              )}

              {startRoundMut.error && (
                <Alert severity="error" sx={{ mt: 1 }}>Failed to start round. Try again.</Alert>
              )}

              <Button
                fullWidth
                variant="contained"
                onClick={() => startRoundMut.mutate()}
                disabled={
                  startRoundMut.isPending ||
                  (selectedCourse.source === 'external' && (!selectedTee || teesQuery.isLoading))
                }
                sx={{ mt: 2, textTransform: 'none' }}
              >
                {startRoundMut.isPending ? 'Starting…' : 'Start Round'}
              </Button>
            </CardContent>
          </Card>
        )}
      </Box>
    </Box>
  )
}
