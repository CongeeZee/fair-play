import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Box, Button, Container, List, ListItem, ListItemText,
  TextField, Typography, CircularProgress, Alert, Paper, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions,
  RadioGroup, FormControlLabel, Radio, FormControl, Chip

} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import GolfCourseIcon from '@mui/icons-material/GolfCourse'
import HistoryIcon from '@mui/icons-material/History'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { searchExternalCourses, getExternalCourseTees } from '../api/courses'
import PageHeader from '../components/PageHeader'
import type { TeeOption } from '../api/courses'
import { createRound, getRounds } from '../api/rounds'
import { formatCourseName } from '../utils'
import type { Round } from '../types'

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
    const result: { externalId?: string; name: string; lastPlayed: string }[] = []
    for (const r of rounds) {
      if (!r.course?.name) continue
      const key = r.course.name
      if (!seen.has(key)) {
        seen.add(key)
        result.push({ name: r.course.name, lastPlayed: r.playedAt })
      }
      if (result.length >= 5) break
    }
    return result
  }, [rounds])
}

export default function CoursesPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loadingTees, setLoadingTees] = useState<number | string | null>(null)
  const [teeDialog, setTeeDialog] = useState<TeeDialog | null>(null)
  const [selectedTee, setSelectedTee] = useState<string>('')
  const [startingRound, setStartingRound] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 400)
    return () => clearTimeout(timer)
  }, [search])

  const ready = debouncedSearch.length >= 2
  const { data: courses, isLoading, error } = useQuery({
    queryKey: ['courses/search', debouncedSearch],
    queryFn: () => searchExternalCourses(debouncedSearch),
    enabled: ready,
  })

  // Fetch round history to show recently played courses
  const { data: rounds } = useQuery({
    queryKey: ['rounds'],
    queryFn: getRounds,
  })

  const recentCourses = useRecentCourses(rounds)

  const fetchTeesAndOpen = useCallback(async (courseId: number | string, overrideName?: string) => {
    setLoadingTees(courseId)
    try {
      const data = await getExternalCourseTees(String(courseId))
      const courseName = overrideName ?? (data.clubName
        ? `${data.courseName} (${data.clubName})`
        : data.courseName)
      setTeeDialog({
        externalCourseId: String(courseId),
        courseName,
        tees: data.tees,
      })
      setSelectedTee(data.tees[0]?.name ?? '')
    } catch {
      // silently ignore — no external ID for history courses
    } finally {
      setLoadingTees(null)
    }
  }, [])

  const handleSelectCourse = useCallback((courseId: number) => {
    fetchTeesAndOpen(courseId)
  }, [fetchTeesAndOpen])

  const handleStartRound = useCallback(async () => {
    if (!teeDialog || !selectedTee) return
    setStartingRound(true)
    try {
      const round = await createRound({
        externalCourseId: teeDialog.externalCourseId,
        teeName: selectedTee,
      })
      navigate(`/rounds/${round.id}`)
    } catch {
      setStartingRound(false)
    }
  }, [teeDialog, selectedTee, navigate])

  const locationStr = (loc?: { city?: string; state?: string; country?: string }) => {
    if (!loc) return null
    return [loc.city, loc.state, loc.country].filter(Boolean).join(', ')
  }

  const showRecent = recentCourses.length > 0 && !ready

  return (
    <Box>
    <PageHeader title="Find a Course" subtitle="Search 30,000+ real courses worldwide" />
    <Container maxWidth="md" sx={{ py: 4 }}>

      <TextField
        fullWidth
        placeholder="Search any golf course worldwide…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 3 }}
        InputProps={{
          startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
        }}
      />

      {/* Recently played courses */}
      {showRecent && (
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <HistoryIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
            <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1.5 }}>
              Recently Played
            </Typography>
          </Box>
          <Paper elevation={1}>
            <List disablePadding>
              {recentCourses.map((c, idx) => {
                const loading = loadingTees === c.name
                return (
                  <Box key={c.name}>
                    {idx > 0 && <Divider />}
                    <ListItem
                      secondaryAction={
                        <Button
                          variant="outlined"
                          color="primary"
                          size="small"
                          disabled={loading || loadingTees !== null}
                          onClick={() => {
                            // Search for the course by name to get the external ID
                            setSearch(formatCourseName(c.name))
                          }}
                        >
                          {loading ? <CircularProgress size={16} color="inherit" /> : 'Play Again'}
                        </Button>
                      }
                    >
                      <ListItemText
                        primary={formatCourseName(c.name)}
                        secondary={`Last played ${new Date(c.lastPlayed).toLocaleDateString('en-GB', { dateStyle: 'medium' })}`}
                      />
                    </ListItem>
                  </Box>
                )
              })}
            </List>
          </Paper>
        </Box>
      )}

      {!ready && !showRecent && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <GolfCourseIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
          <Typography color="text.secondary">
            Type at least 2 characters to search 30,000+ real courses
          </Typography>
        </Box>
      )}

      {!ready && showRecent && (
        <Box sx={{ textAlign: 'center', py: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Or search for a new course above
          </Typography>
        </Box>
      )}

      {ready && isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress color="primary" />
        </Box>
      )}

      {ready && error && (
        <Alert severity="error">Failed to search courses. Please try again.</Alert>
      )}

      {ready && !isLoading && courses && courses.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography color="text.secondary">No courses found for "{debouncedSearch}"</Typography>
        </Box>
      )}

      {courses && courses.length > 0 && (
        <Paper elevation={1}>
          <List disablePadding>
            {courses.map((course, idx) => {
              const loc = locationStr(course.location)
              const secondary = [course.club_name, loc].filter(Boolean).join(' · ')
              const loading = loadingTees === course.id
              return (
                <Box key={course.id}>
                  {idx > 0 && <Divider />}
                  <ListItem
                    secondaryAction={
                      <Button
                        variant="contained"
                        color="secondary"
                        size="small"
                        disabled={loading || loadingTees !== null}
                        onClick={() => handleSelectCourse(course.id)}
                      >
                        {loading ? <CircularProgress size={16} color="inherit" /> : 'Start Round'}
                      </Button>
                    }
                  >
                    <ListItemText
                      primary={course.course_name}
                      secondary={secondary || undefined}
                    />
                  </ListItem>
                </Box>
              )
            })}
          </List>
        </Paper>
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
              {teeDialog?.tees.map((tee) => (
                <FormControlLabel
                  key={tee.name}
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
