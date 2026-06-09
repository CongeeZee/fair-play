import { useState, useCallback, useMemo } from 'react'
import {
  Box, Button, Container, List, ListItem, ListItemText,
  Typography, CircularProgress, Paper, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions,
  RadioGroup, FormControlLabel, Radio, FormControl, Chip
} from '@mui/material'
import HistoryIcon from '@mui/icons-material/History'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueries } from '@tanstack/react-query'
import { getExternalCourseTees } from '../api/courses'
import { getCourseReviewsSummary } from '../api/reviews'
import StarRating from '../components/StarRating'
import PageHeader from '../components/PageHeader'
import CourseSearchInput, { type CourseSearchResult } from '../components/CourseSearchInput'
import type { TeeOption } from '../api/courses'
import { createRound, getRounds } from '../api/rounds'
import { capture, AnalyticsEvent } from '../analytics'
import { formatCourseName } from '../utils'
import type { Round } from '../types'
import FirstTimeTooltip from '../components/FirstTimeTooltip'

interface TeeDialog {
  externalCourseId: string
  courseName: string
  tees: TeeOption[]
}

// Derive unique recently played courses from rounds history
function useRecentCourses(rounds: Round[] | undefined) {
  return useMemo(() => {
    if (!rounds || rounds.length === 0) return []
    const seen = new Set<string>()
    const result: { courseId: string; externalId?: string | null; name: string; lastPlayed: string }[] = []
    for (const r of rounds) {
      if (!r.course?.name) continue
      const key = r.course.name
      if (!seen.has(key)) {
        seen.add(key)
        result.push({ courseId: r.course.id, externalId: r.course.externalId, name: r.course.name, lastPlayed: r.playedAt })
      }
      if (result.length >= 5) break
    }
    return result
  }, [rounds])
}

export default function CoursesPage() {
  const navigate = useNavigate()
  const [loadingTees, setLoadingTees] = useState<string | null>(null)
  const [playAgainLoading, setPlayAgainLoading] = useState<string | null>(null)
  const [teeDialog, setTeeDialog] = useState<TeeDialog | null>(null)
  const [selectedTee, setSelectedTee] = useState<string>('')
  const [startingRound, setStartingRound] = useState(false)

  // Fetch round history to show recently played courses
  const { data: rounds } = useQuery({
    queryKey: ['rounds'],
    queryFn: getRounds,
  })

  const recentCourses = useRecentCourses(rounds)

  // Batch summary requests for recently played courses
  const summaryKeys = useMemo(
    () => Array.from(new Set(recentCourses.map((c) => c.externalId || c.courseId))),
    [recentCourses]
  )

  const summaryQueries = useQueries({
    queries: summaryKeys.map((key) => ({
      queryKey: ['course-review-summary', key],
      queryFn: () => getCourseReviewsSummary(key),
      staleTime: 30 * 60_000,
    })),
  })
  const summaryByKey = useMemo(() => {
    const map = new Map<string, { averageRating: number | null; totalReviews: number }>()
    summaryKeys.forEach((k, i) => {
      const d = summaryQueries[i]?.data
      if (d) map.set(String(k), d)
    })
    return map
  }, [summaryKeys, summaryQueries])

  const fetchTeesAndOpen = useCallback(async (externalId: string, displayName: string) => {
    setLoadingTees(externalId)
    try {
      const data = await getExternalCourseTees(externalId)
      const courseName = data.clubName
        ? `${data.courseName} (${data.clubName})`
        : data.courseName || displayName
      setTeeDialog({
        externalCourseId: externalId,
        courseName,
        tees: data.tees,
      })
      setSelectedTee(data.tees[0]?.name ?? '')
    } catch {
      // silently ignore
    } finally {
      setLoadingTees(null)
    }
  }, [])

  const handleSelectCourse = useCallback((c: CourseSearchResult) => {
    if (c.source === 'external') {
      fetchTeesAndOpen(c.id, c.name)
    }
  }, [fetchTeesAndOpen])

  const handlePlayAgain = useCallback(async (courseId: string) => {
    setPlayAgainLoading(courseId)
    try {
      const round = await createRound({ courseId })
      capture(AnalyticsEvent.RoundStarted, { courseId: Number(courseId) })
      navigate(`/rounds/${round.id}`)
    } catch {
      setPlayAgainLoading(null)
    }
  }, [navigate])

  const handleStartRound = useCallback(async () => {
    if (!teeDialog || !selectedTee) return
    setStartingRound(true)
    try {
      const round = await createRound({
        externalCourseId: teeDialog.externalCourseId,
        teeName: selectedTee,
      })
      capture(AnalyticsEvent.RoundStarted, {
        externalCourseId: teeDialog.externalCourseId,
      })
      navigate(`/rounds/${round.id}`)
    } catch {
      setStartingRound(false)
    }
  }, [teeDialog, selectedTee, navigate])

  const showRecent = recentCourses.length > 0

  return (
    <Box>
      <PageHeader title="Find a Course" subtitle="Search 30,000+ real courses worldwide" />
      <Container maxWidth="md" sx={{ py: 4 }}>

        <FirstTimeTooltip
          storageKey="tooltip_courses_seen"
          message="Search for a course to start your first round."
        >
          <Box sx={{ mb: 3 }}>
            <CourseSearchInput
              source="external"
              variant="fullPage"
              placeholder="Search any golf course worldwide…"
              clearOnSelect={false}
              onSelect={handleSelectCourse}
            />
          </Box>
        </FirstTimeTooltip>

        {/* Loading overlay when fetching tees from a selection */}
        {loadingTees && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        )}

        {/* Recently played courses */}
        {showRecent && (
          <Box sx={{ mt: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <HistoryIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
              <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1.5 }}>
                Recently Played
              </Typography>
            </Box>
            <Paper elevation={1}>
              <List disablePadding>
                {recentCourses.map((c, idx) => {
                  const loading = playAgainLoading === c.courseId
                  return (
                    <Box key={c.courseId}>
                      {idx > 0 && <Divider />}
                      <ListItem
                        secondaryAction={
                          <Button
                            variant="outlined"
                            color="primary"
                            size="small"
                            disabled={loading || playAgainLoading !== null}
                            onClick={() => handlePlayAgain(c.courseId)}
                          >
                            {loading ? <CircularProgress size={16} color="inherit" /> : 'Play Again'}
                          </Button>
                        }
                      >
                        <ListItemText
                          primary={formatCourseName(c.name)}
                          secondary={
                            <Box component="span" sx={{ display: 'flex', flexDirection: 'column' }}>
                              <span>{`Last played ${new Date(c.lastPlayed).toLocaleDateString('en-GB', { dateStyle: 'medium' })}`}</span>
                              {(() => {
                                const key = c.externalId || c.courseId
                                const s = summaryByKey.get(String(key))
                                if (!s || s.totalReviews < 1 || s.averageRating == null) return null
                                return (
                                  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                                    <StarRating value={s.averageRating} size="small" readOnly />
                                    <Typography component="span" variant="caption" color="text.secondary">
                                      ({s.totalReviews} review{s.totalReviews === 1 ? '' : 's'})
                                    </Typography>
                                  </Box>
                                )
                              })()}
                            </Box>
                          }
                          secondaryTypographyProps={{ component: 'div' }}
                        />
                      </ListItem>
                    </Box>
                  )
                })}
              </List>
            </Paper>
          </Box>
        )}

        {/* Tee selection dialog */}
        <Dialog open={!!teeDialog} onClose={() => !startingRound && setTeeDialog(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Select Tees</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {teeDialog?.courseName}
            </Typography>
            <FormControl component="fieldset" fullWidth>
              <RadioGroup
                value={selectedTee}
                onChange={(e) => setSelectedTee(e.target.value)}
              >
                {teeDialog?.tees.map((tee, i) => (
                  <FormControlLabel
                    key={`${tee.name}-${i}`}
                    value={tee.name}
                    control={<Radio />}
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                        <Typography>
                          {tee.name.split(',').map(s => s.trim()).filter(s => !/^\d+$/.test(s) && s.toUpperCase() !== 'USGA').join(' ')}
                        </Typography>
                        <Chip label={`${tee.totalYards} yds`} size="small" variant="outlined" />
                        <Typography variant="caption" color="text.secondary">
                          Par {tee.parTotal}
                        </Typography>
                      </Box>
                    }
                  />
                ))}
              </RadioGroup>
            </FormControl>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setTeeDialog(null)} disabled={startingRound}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleStartRound}
              disabled={!selectedTee || startingRound}
            >
              {startingRound ? 'Starting…' : 'Start Round'}
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </Box>
  )
}
