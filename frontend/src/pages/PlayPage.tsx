import { useState, useEffect, useMemo } from 'react'
import {
  Box, Typography, Card, CardContent, CardActionArea, Button, Chip,
  CircularProgress, Alert, RadioGroup, FormControlLabel, Radio,
  FormControl, TextField, ToggleButton, ToggleButtonGroup, Paper,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import CloseIcon from '@mui/icons-material/Close'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getTeeTimes } from '../api/teetimes'
import { getExternalCourseTees } from '../api/courses'
import { createRound, getRounds } from '../api/rounds'
import { capture, AnalyticsEvent } from '../analytics'
import PageHeader from '../components/PageHeader'
import CourseSearchInput, { type CourseSearchResult } from '../components/CourseSearchInput'
import ResumeRoundBanner from '../components/ResumeRoundBanner'
import { getLiveRounds } from '../api/live'
import { CLAY, tint } from '../theme'
import { teeKey, parseTeeKey, formatTeeName, formatCourseName } from '../utils'
import { useUnits } from '../contexts/UnitsContext'
import type { Round } from '../types'

function relativeDate(dt: string): string {
  const d = new Date(dt)
  const now = new Date()
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / 864e5)
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  const dayOfWeek = d.toLocaleDateString(undefined, { weekday: 'long' })
  if (diffDays <= 6) return `This ${dayOfWeek}`
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

function toParLabel(n: number) {
  return n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`
}

/** YYYY-MM-DD in local time, for <input type="date">. */
function isoDay(d: Date) {
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10)
}

interface RecentCourse {
  courseId: string
  name: string
  lastPlayed: string
  rounds: number
  best: number | null
}

/** Courses you've played, most recent first, with your record there. */
function useRecentCourses(rounds: Round[] | undefined): RecentCourse[] {
  return useMemo(() => {
    const map = new Map<string, RecentCourse>()
    for (const r of rounds ?? []) {
      if (!r.course?.name) continue
      const full = r.holesCompleted != null && r.holesCompleted === (r.course.holes?.length ?? 18)
      const entry = map.get(r.courseId) ?? { courseId: r.courseId, name: r.course.name, lastPlayed: r.playedAt, rounds: 0, best: null }
      entry.rounds++
      if (new Date(r.playedAt) > new Date(entry.lastPlayed)) entry.lastPlayed = r.playedAt
      if (full && r.scoreToPar != null && (entry.best == null || r.scoreToPar < entry.best)) entry.best = r.scoreToPar
      map.set(r.courseId, entry)
    }
    return [...map.values()]
      .sort((a, b) => new Date(b.lastPlayed).getTime() - new Date(a.lastPlayed).getTime())
      .slice(0, 4)
  }, [rounds])
}

type When = 'today' | 'yesterday' | 'other'

export default function PlayPage() {
  const { formatDistance } = useUnits()
  const navigate = useNavigate()
  const [selectedCourse, setSelectedCourse] = useState<CourseSearchResult | null>(null)
  const [selectedTee, setSelectedTee] = useState<string>('')
  const [when, setWhen] = useState<When>('today')
  const [otherDay, setOtherDay] = useState(() => isoDay(new Date(Date.now() - 2 * 864e5)))

  const { data } = useQuery({ queryKey: ['teetimes'], queryFn: getTeeTimes, staleTime: 60_000 })

  // Surface an in-progress round so "Play" resumes it rather than burying it
  const { data: liveData } = useQuery({ queryKey: ['live-rounds'], queryFn: getLiveRounds, staleTime: 30_000 })

  // Shares the ['rounds'] cache with History and Stats
  const { data: rounds } = useQuery({ queryKey: ['rounds'], queryFn: getRounds })
  const recentCourses = useRecentCourses(rounds)

  const teesQuery = useQuery({
    queryKey: ['external-course-tees', selectedCourse?.id],
    queryFn: () => getExternalCourseTees(selectedCourse!.id),
    enabled: !!selectedCourse && selectedCourse.source === 'external',
  })

  const playedAt = (): string | undefined => {
    if (when === 'today') return undefined
    const d = when === 'yesterday' ? new Date(Date.now() - 864e5) : new Date(`${otherDay}T12:00:00`)
    // A backdated round is a whole round logged after the fact: midday keeps
    // it on the right calendar day in every timezone.
    d.setHours(12, 0, 0, 0)
    return d.toISOString()
  }

  const startRoundMut = useMutation({
    mutationFn: async () => {
      if (!selectedCourse) throw new Error('No course selected')
      if (selectedCourse.source === 'external') {
        const tee = parseTeeKey(selectedTee)
        return createRound({
          externalCourseId: selectedCourse.id,
          teeName: tee?.name ?? selectedTee,
          teeGender: tee?.gender,
          playedAt: playedAt(),
        })
      }
      return createRound({ courseId: selectedCourse.id, playedAt: playedAt() })
    },
    onSuccess: (round) => {
      capture(AnalyticsEvent.RoundStarted, {
        courseId: selectedCourse?.source === 'local' ? Number(selectedCourse.id) : undefined,
        externalCourseId: selectedCourse?.source === 'external' ? selectedCourse.id : undefined,
      })
      navigate(`/rounds/${round.id}`)
    },
  })

  const choose = (c: CourseSearchResult) => {
    setSelectedCourse(c)
    setSelectedTee('')
    startRoundMut.reset()
  }

  // Default the tee selection to the first one once loaded. `selectedTee` holds
  // the composite "gender:name" key, not the bare name — see teeKey().
  useEffect(() => {
    if (teesQuery.data && teesQuery.data.tees.length > 0 && !selectedTee) {
      setSelectedTee(teeKey(teesQuery.data.tees[0]))
    }
  }, [teesQuery.data, selectedTee])

  const myUpcoming = data?.myUpcoming?.slice(0, 3) ?? []
  const invitations = data?.invitations?.slice(0, 3) ?? []
  const totalUpcoming = (data?.myUpcoming?.length ?? 0) + (data?.invitations?.length ?? 0)
  const needsTee = selectedCourse?.source === 'external'
  const canStart = !!selectedCourse && !startRoundMut.isPending && (!needsTee || (!!selectedTee && !teesQuery.isLoading))

  return (
    <Box sx={{ maxWidth: 640, mx: 'auto', px: 2, pb: 4 }}>
      <PageHeader title="Play" subtitle="Start a round, log one you've played, or organise the next" />

      {liveData?.ownLiveRound && <ResumeRoundBanner round={liveData.ownLiveRound} />}

      {/* ── Start a round ─────────────────────────────────────────────── */}
      <Paper elevation={0} sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 1.5 }}>Start a round</Typography>

        {!selectedCourse && (
          <>
            <CourseSearchInput source="both" variant="inline" placeholder="Search any course worldwide…" onSelect={choose} />

            {recentCourses.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  Your courses
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {recentCourses.map((c) => (
                    <Card key={c.courseId} variant="outlined">
                      <CardActionArea
                        onClick={() => choose({ source: 'local', id: c.courseId, name: formatCourseName(c.name) })}
                        sx={{ px: 2, py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5 }}
                      >
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{formatCourseName(c.name)}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {c.rounds} round{c.rounds === 1 ? '' : 's'}
                            {c.best != null && ` · best ${toParLabel(c.best)}`}
                            {` · last ${new Date(c.lastPlayed).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
                          </Typography>
                        </Box>
                        <Box sx={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: tint(CLAY.green, 0.12), color: CLAY.greenText, flexShrink: 0 }}>
                          <PlayArrowRoundedIcon />
                        </Box>
                      </CardActionArea>
                    </Card>
                  ))}
                </Box>
              </Box>
            )}
          </>
        )}

        {selectedCourse && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 2 }}>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>{selectedCourse.name}</Typography>
                {selectedCourse.subtitle && (
                  <Typography variant="caption" color="text.secondary">{selectedCourse.subtitle}</Typography>
                )}
              </Box>
              <Button size="small" startIcon={<CloseIcon />} onClick={() => setSelectedCourse(null)} sx={{ color: 'text.secondary' }}>
                Change
              </Button>
            </Box>

            {needsTee && teesQuery.isLoading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={22} /></Box>
            )}
            {needsTee && teesQuery.error && (
              <Alert severity="error" sx={{ my: 1 }}>Could not load tees for this course. Try again in a moment.</Alert>
            )}
            {needsTee && teesQuery.data && teesQuery.data.tees.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="overline" color="text.secondary">Tees</Typography>
                <FormControl component="fieldset" fullWidth>
                  <RadioGroup value={selectedTee} onChange={(e) => setSelectedTee(e.target.value)}>
                    {teesQuery.data.tees.map((tee) => (
                      <FormControlLabel
                        key={teeKey(tee)}
                        value={teeKey(tee)}
                        control={<Radio size="small" />}
                        label={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatTeeName(tee.name)}</Typography>
                            {/* Only where two rows would otherwise be identical */}
                            {teesQuery.data.duplicateNames.includes(tee.name) && (
                              <Chip label={tee.gender === 'female' ? "Women's" : "Men's"} size="small" color="secondary" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }} />
                            )}
                            <Typography variant="caption" color="text.secondary">
                              {formatDistance(tee.totalYards)} · Par {tee.parTotal}
                            </Typography>
                          </Box>
                        }
                      />
                    ))}
                  </RadioGroup>
                </FormControl>
              </Box>
            )}

            <Typography variant="overline" color="text.secondary" sx={{ display: 'block' }}>When</Typography>
            <ToggleButtonGroup
              exclusive
              value={when}
              onChange={(_, v: When | null) => v && setWhen(v)}
              size="small"
              sx={{ mb: when === 'other' ? 1.5 : 2 }}
            >
              <ToggleButton value="today">Today</ToggleButton>
              <ToggleButton value="yesterday">Yesterday</ToggleButton>
              <ToggleButton value="other">Earlier</ToggleButton>
            </ToggleButtonGroup>
            {when === 'other' && (
              <TextField
                type="date"
                size="small"
                label="Date played"
                value={otherDay}
                onChange={(e) => setOtherDay(e.target.value)}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: isoDay(new Date()) } }}
                sx={{ mb: 2, display: 'block' }}
              />
            )}

            {startRoundMut.error && (
              <Alert severity="error" sx={{ mb: 1.5 }}>Couldn't start the round. Check your connection and try again.</Alert>
            )}

            <Button fullWidth size="large" variant="contained" onClick={() => startRoundMut.mutate()} disabled={!canStart}>
              {startRoundMut.isPending ? 'Starting…' : when === 'today' ? 'Start round' : 'Log round'}
            </Button>
          </Box>
        )}
      </Paper>

      {/* ── Upcoming rounds ───────────────────────────────────────────── */}
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6">Upcoming rounds</Typography>
          <Button size="small" onClick={() => navigate('/teetimes')} endIcon={<ArrowForwardIcon />}>
            {totalUpcoming > 3 ? 'See all' : 'Tee times'}
          </Button>
        </Box>

        {invitations.map((tt) => (
          <Card key={tt.id} elevation={0} sx={{ mb: 1, bgcolor: tint(CLAY.gold, 0.14), borderColor: CLAY.goldGraphic }}>
            <CardActionArea onClick={() => navigate(`/teetimes/${tt.id}`)}>
              <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{tt.courseName ? formatCourseName(tt.courseName) : 'Course TBD'}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {relativeDate(tt.dateTime)} · from {tt.creatorName}
                    </Typography>
                  </Box>
                  <Chip label="Invited — respond" size="small" sx={{ bgcolor: CLAY.gold, color: CLAY.onGold, fontWeight: 700, fontSize: '0.7rem', height: 24 }} />
                </Box>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}

        {myUpcoming.map((tt) => (
          <Card key={tt.id} variant="outlined" sx={{ mb: 1 }}>
            <CardActionArea onClick={() => navigate(`/teetimes/${tt.id}`)}>
              <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{tt.courseName ? formatCourseName(tt.courseName) : 'Course TBD'}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {relativeDate(tt.dateTime)} · {new Date(tt.dateTime).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · {tt.spotsFilled}/{tt.spotsTotal} players
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {tt.participants.filter((p) => p.status === 'CONFIRMED').slice(0, 2).map((p) => (
                      <Chip key={p.userId} label={p.name.split(' ')[0]} size="small" sx={{ height: 22, fontSize: '0.7rem' }} />
                    ))}
                  </Box>
                </Box>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}

        {invitations.length === 0 && myUpcoming.length === 0 && (
          <Card variant="outlined" sx={{ borderStyle: 'dashed' }}>
            <CardContent sx={{ py: 2.5, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Nothing booked. Set a time and let your mates join.
              </Typography>
              <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => navigate('/teetimes?create=1')}>
                Create tee time
              </Button>
            </CardContent>
          </Card>
        )}
      </Box>
    </Box>
  )
}
