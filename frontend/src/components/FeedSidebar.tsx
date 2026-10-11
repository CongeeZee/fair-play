import { useState, type ReactNode } from 'react'
import { Box, Typography, Paper, List, ListItemButton, ListItemText, Chip, Button } from '@mui/material'
import GroupAddIcon from '@mui/icons-material/GroupAdd'
import LinkIcon from '@mui/icons-material/Link'
import GolfCourseIcon from '@mui/icons-material/GolfCourse'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getFriendSuggestions, sendFriendRequest } from '../api/friends'
import UserAvatar from './UserAvatar'
import InviteFriendsDialog from './InviteFriendsDialog'
import { getTeeTimes } from '../api/teetimes'
import { getCompetitions } from '../api/competitions'
import { formatCourseName } from '../utils'
import type { TeeTimeSummary, CompetitionSummary } from '../types'
import { CLAY, tint } from '../theme'

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
    <Paper elevation={0} sx={{ overflow: 'hidden', mb: 2 }}>
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
        <Chip label="Invited" size="small" sx={{ ml: 1, height: 20, fontSize: '0.65rem', fontWeight: 700, bgcolor: CLAY.gold, color: CLAY.onGold }} />
      )}
    </ListItemButton>
  )
}

function CompetitionRow({ comp }: { comp: CompetitionSummary }) {
  const navigate = useNavigate()
  const statusColor = comp.status === 'ACTIVE' ? CLAY.green : CLAY.clayBlue
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
          // Gold needs dark ink on it; the green and blue fills take white.
          ml: 1, height: 20, fontSize: '0.65rem', fontWeight: 700,
          color: comp.myStatus === 'INVITED' ? CLAY.onGold : '#fff',
          bgcolor: comp.myStatus === 'INVITED' ? CLAY.gold : statusColor,
        }}
      />
    </ListItemButton>
  )
}

function Empty({ text, action, to }: { text: string; action: string; to: string }) {
  const navigate = useNavigate()
  return (
    <Box sx={{ px: 2, pb: 1.5, pt: 0.25 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{text}</Typography>
      <Button size="small" variant="outlined" onClick={() => navigate(to)}>{action}</Button>
    </Box>
  )
}

function Suggestions() {
  const queryClient = useQueryClient()
  const [sent, setSent] = useState<Set<number>>(new Set())
  const { data } = useQuery({ queryKey: ['friend-suggestions'], queryFn: getFriendSuggestions, staleTime: 10 * 60_000 })
  const add = useMutation({
    mutationFn: sendFriendRequest,
    onSuccess: (_d, id) => {
      setSent((s) => new Set(s).add(id))
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] })
    },
  })
  const people = (data ?? []).slice(0, 3)
  if (people.length === 0) return null
  return (
    <SidebarSection title="People you may know" icon={<GroupAddIcon sx={{ fontSize: 18, color: 'var(--c-greenText)' }} />} seeAllTo="/friends?tab=add">
      <List disablePadding sx={{ pb: 0.5 }}>
        {people.map((p) => (
          <Box key={p.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 0.75 }}>
            <UserAvatar userId={p.id} name={p.name} size={32} link={false} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{p.name}</Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {p.playedWith ? 'Played with you' : `${p.mutualFriends} mutual`}
              </Typography>
            </Box>
            {sent.has(p.id)
              ? <Typography variant="caption" color="text.secondary">Sent</Typography>
              : <Button size="small" onClick={() => add.mutate(p.id)} disabled={add.isPending} sx={{ minWidth: 0 }}>Add</Button>}
          </Box>
        ))}
      </List>
    </SidebarSection>
  )
}

/**
 * Desktop companion column for the feed: what's coming up, people to add and
 * a way to bring the group in. Every section has something to show — the
 * column used to render nothing at all for anyone without a tee time or a
 * competition, leaving a blank 300px gap that pushed the feed off-centre.
 */
export default function FeedSidebar() {
  const { data: teeTimes } = useQuery({ queryKey: ['teetimes'], queryFn: getTeeTimes })
  const { data: comps } = useQuery({ queryKey: ['competitions'], queryFn: getCompetitions })
  const [inviteOpen, setInviteOpen] = useState(false)

  const upcomingTeeTimes = [
    ...(teeTimes?.invitations ?? []).map((tt) => ({ tt, invited: true })),
    ...(teeTimes?.myUpcoming ?? []).map((tt) => ({ tt, invited: false })),
  ].slice(0, MAX_ITEMS)

  const activeComps = [
    ...(comps?.active ?? []),
    ...(comps?.upcoming ?? []),
  ].slice(0, MAX_ITEMS)

  const rows = { borderTop: '1px solid var(--c-borderC)' }

  return (
    <Box>
      <SidebarSection
        title="Upcoming rounds"
        icon={<GolfCourseIcon sx={{ fontSize: 18, color: 'var(--c-greenText)' }} />}
        seeAllTo="/teetimes"
      >
        {upcomingTeeTimes.length > 0 ? (
          <List disablePadding sx={{ pb: 0.5 }}>
            {upcomingTeeTimes.map(({ tt, invited }, i) => (
              <Box key={tt.id} sx={i > 0 ? rows : undefined}>
                <TeeTimeRow tt={tt} invited={invited} />
              </Box>
            ))}
          </List>
        ) : (
          <Empty text="Nothing booked yet." action="Create a tee time" to="/teetimes?create=1" />
        )}
      </SidebarSection>

      <SidebarSection
        title="Competitions"
        icon={<EmojiEventsIcon sx={{ fontSize: 18, color: CLAY.goldGraphic }} />}
        seeAllTo="/competitions"
      >
        {activeComps.length > 0 ? (
          <List disablePadding sx={{ pb: 0.5 }}>
            {activeComps.map((comp, i) => (
              <Box key={comp.id} sx={i > 0 ? rows : undefined}>
                <CompetitionRow comp={comp} />
              </Box>
            ))}
          </List>
        ) : (
          <Empty text="Run a monthly medal or Stableford with your group." action="Start a competition" to="/competitions" />
        )}
      </SidebarSection>

      <Suggestions />

      <Paper elevation={0} sx={{ p: 2, bgcolor: tint(CLAY.green, 0.07) }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>Bring your group</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Anyone who joins with your link is added as a friend.
        </Typography>
        <Button size="small" variant="contained" startIcon={<LinkIcon />} onClick={() => setInviteOpen(true)}>
          Share invite link
        </Button>
      </Paper>
      <InviteFriendsDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </Box>
  )
}
