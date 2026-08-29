import type { ReactNode } from 'react'
import { Box, Typography, Paper, List, ListItemButton, ListItemText, Chip, Divider, Button } from '@mui/material'
import GolfCourseIcon from '@mui/icons-material/GolfCourse'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getTeeTimes } from '../api/teetimes'
import { getCompetitions } from '../api/competitions'
import { formatCourseName } from '../utils'
import type { TeeTimeSummary, CompetitionSummary } from '../types'

const MAX_ITEMS = 3

function sidebarDate(dt: string): string {
  const d = new Date(dt)
  const now = new Date()
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / 86_400_000)
  const time = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
  if (diffDays <= 0) return `Today · ${time}`
  if (diffDays === 1) return `Tomorrow · ${time}`
  if (diffDays <= 6) return `${d.toLocaleDateString('en-AU', { weekday: 'long' })} · ${time}`
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) + ` · ${time}`
}

function shortRange(start: string, end: string): string {
  const opts = { day: 'numeric', month: 'short' } as const
  return `${new Date(start).toLocaleDateString('en-AU', opts)} – ${new Date(end).toLocaleDateString('en-AU', opts)}`
}

function SidebarSection({ title, icon, seeAllTo, children }: {
  title: string
  icon: ReactNode
  seeAllTo: string
  children: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden', mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, pt: 1.5, pb: 0.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.75 }}>
          {icon}
          {title}
        </Typography>
        <Button
          size="small"
          endIcon={<ArrowForwardIcon sx={{ fontSize: '0.9rem !important' }} />}
          onClick={() => navigate(seeAllTo)}
          sx={{ textTransform: 'none', fontSize: '0.75rem', minWidth: 0 }}
        >
          See all
        </Button>
      </Box>
      {children}
    </Paper>
  )
}

function TeeTimeRow({ tt, invited }: { tt: TeeTimeSummary; invited?: boolean }) {
  const navigate = useNavigate()
  const spotsLeft = tt.spotsTotal - tt.spotsFilled
  return (
    <ListItemButton dense onClick={() => navigate(`/teetimes/${tt.id}`)} sx={{ py: 0.75 }}>
      <ListItemText
        primary={tt.course?.name ? formatCourseName(tt.course.name) : tt.courseName ? formatCourseName(tt.courseName) : 'Course TBC'}
        secondary={`${sidebarDate(tt.dateTime)} · ${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left`}
        primaryTypographyProps={{ variant: 'body2', fontWeight: 600, noWrap: true }}
        secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
      />
      {invited && (
        <Chip label="Invited" size="small" sx={{ ml: 1, height: 20, fontSize: '0.65rem', fontWeight: 700, bgcolor: '#e0b95c', color: '#fff' }} />
      )}
    </ListItemButton>
  )
}

function CompetitionRow({ comp }: { comp: CompetitionSummary }) {
  const navigate = useNavigate()
  const statusColor = comp.status === 'ACTIVE' ? '#4a8a68' : '#5c86a8'
  return (
    <ListItemButton dense onClick={() => navigate(`/competitions/${comp.id}`)} sx={{ py: 0.75 }}>
      <ListItemText
        primary={comp.name}
        secondary={`${shortRange(comp.startDate, comp.endDate)} · ${comp.participantCount} player${comp.participantCount !== 1 ? 's' : ''}`}
        primaryTypographyProps={{ variant: 'body2', fontWeight: 600, noWrap: true }}
        secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
      />
      <Chip
        label={comp.myStatus === 'INVITED' ? 'Invited' : comp.status === 'ACTIVE' ? 'Live' : 'Upcoming'}
        size="small"
        sx={{
          ml: 1, height: 20, fontSize: '0.65rem', fontWeight: 700, color: '#fff',
          bgcolor: comp.myStatus === 'INVITED' ? '#e0b95c' : statusColor,
        }}
      />
    </ListItemButton>
  )
}

/**
 * Desktop-only companion column for the feed: surfaces upcoming tee times and
 * live/upcoming competitions so wide screens aren't just a 600px strip of
 * whitespace. Hidden below the `lg` breakpoint (parent controls visibility).
 */
export default function FeedSidebar() {
  const { data: teeTimes } = useQuery({ queryKey: ['teetimes'], queryFn: getTeeTimes })
  const { data: comps } = useQuery({ queryKey: ['competitions'], queryFn: getCompetitions })

  // Invitations first — they need a response — then confirmed upcoming rounds.
  const upcomingTeeTimes = [
    ...(teeTimes?.invitations ?? []).map((tt) => ({ tt, invited: true })),
    ...(teeTimes?.myUpcoming ?? []).map((tt) => ({ tt, invited: false })),
  ].slice(0, MAX_ITEMS)

  const activeComps = [
    ...(comps?.active ?? []),
    ...(comps?.upcoming ?? []),
  ].slice(0, MAX_ITEMS)

  if (upcomingTeeTimes.length === 0 && activeComps.length === 0) return null

  return (
    <Box>
      {upcomingTeeTimes.length > 0 && (
        <SidebarSection
          title="Upcoming rounds"
          icon={<GolfCourseIcon sx={{ fontSize: 18, color: '#2f6b4c' }} />}
          seeAllTo="/teetimes"
        >
          <List disablePadding sx={{ pb: 0.5 }}>
            {upcomingTeeTimes.map(({ tt, invited }, i) => (
              <Box key={tt.id}>
                {i > 0 && <Divider component="li" />}
                <TeeTimeRow tt={tt} invited={invited} />
              </Box>
            ))}
          </List>
        </SidebarSection>
      )}

      {activeComps.length > 0 && (
        <SidebarSection
          title="Competitions"
          icon={<EmojiEventsIcon sx={{ fontSize: 18, color: '#e0b95c' }} />}
          seeAllTo="/competitions"
        >
          <List disablePadding sx={{ pb: 0.5 }}>
            {activeComps.map((comp, i) => (
              <Box key={comp.id}>
                {i > 0 && <Divider component="li" />}
                <CompetitionRow comp={comp} />
              </Box>
            ))}
          </List>
        </SidebarSection>
      )}
    </Box>
  )
}
