import { useState, type ReactNode } from 'react'
import { Box, Typography, Paper, List, ListItemButton, ListItemText, Chip, Button } from '@mui/material'
import GroupAddIcon from '@mui/icons-material/GroupAdd'
import LinkIcon from '@mui/icons-material/Link'
import GolfCourseIcon from '@mui/icons-material/GolfCourse'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import HistoryIcon from '@mui/icons-material/History'
import LightbulbIcon from '@mui/icons-material/Lightbulb'
import PeopleIcon from '@mui/icons-material/People'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getFriends, getFriendSuggestions, sendFriendRequest } from '../api/friends'
import { getInsights, getRounds } from '../api/rounds'
import UserAvatar from './UserAvatar'
import InviteFriendsDialog from './InviteFriendsDialog'
import { getTeeTimes } from '../api/teetimes'
import { getCompetitions } from '../api/competitions'
import { formatCourseName, formatHandicap } from '../utils'
import { scoreBand } from '../scoreColors'
import type { TeeTimeSummary, CompetitionSummary } from '../types'
import { CLAY, tint } from '../theme'

/*
 * Cards for the side rails of wide-screen pages (see PageShell). Each one is
 * self-contained — it owns its query and renders something useful even when
 * there's no data — so a page picks the ones that fit and stacks them.
 */

const MAX_ITEMS = 3
const rowDivider = { borderTop: '1px solid var(--c-borderC)' }
const iconSx = { fontSize: 18, color: 'var(--c-greenText)' }

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

export function RailSection({ title, icon, seeAllTo, children }: {
  title: string
  icon: ReactNode
  seeAllTo?: string
  children: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <Paper elevation={0} sx={{ overflow: 'hidden', mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, pt: 1.5, pb: 0.5, minHeight: 40 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.75 }}>
          {icon}
          {title}
        </Typography>
        {seeAllTo && (
          <Button
            size="small"
            endIcon={<ArrowForwardIcon sx={{ fontSize: '0.9rem !important' }} />}
            onClick={() => navigate(seeAllTo)}
            sx={{ textTransform: 'none', fontSize: '0.75rem', minWidth: 0 }}
          >
            See all
          </Button>
        )}
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

function Empty({ text, action, to }: { text: string; action?: string; to?: string }) {
  const navigate = useNavigate()
  return (
    <Box sx={{ px: 2, pb: 1.5, pt: 0.25 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: action ? 1 : 0 }}>{text}</Typography>
      {action && to && <Button size="small" variant="outlined" onClick={() => navigate(to)}>{action}</Button>}
    </Box>
  )
}

/** Tee times you're in or invited to. */
export function UpcomingRoundsCard() {
  const { data: teeTimes } = useQuery({ queryKey: ['teetimes'], queryFn: getTeeTimes })
  const upcoming = [
    ...(teeTimes?.invitations ?? []).map((tt) => ({ tt, invited: true })),
    ...(teeTimes?.myUpcoming ?? []).map((tt) => ({ tt, invited: false })),
  ].slice(0, MAX_ITEMS)

  return (
    <RailSection title="Upcoming rounds" icon={<GolfCourseIcon sx={iconSx} />} seeAllTo="/teetimes">
      {upcoming.length > 0 ? (
        <List disablePadding sx={{ pb: 0.5 }}>
          {upcoming.map(({ tt, invited }, i) => (
            <Box key={tt.id} sx={i > 0 ? rowDivider : undefined}>
              <TeeTimeRow tt={tt} invited={invited} />
            </Box>
          ))}
        </List>
      ) : (
        <Empty text="Nothing booked yet." action="Create a tee time" to="/teetimes?create=1" />
      )}
    </RailSection>
  )
}

/** Live and upcoming competitions. */
export function CompetitionsCard() {
  const { data: comps } = useQuery({ queryKey: ['competitions'], queryFn: getCompetitions })
  const active = [...(comps?.active ?? []), ...(comps?.upcoming ?? [])].slice(0, MAX_ITEMS)

  return (
    <RailSection title="Competitions" icon={<EmojiEventsIcon sx={{ fontSize: 18, color: CLAY.goldGraphic }} />} seeAllTo="/competitions">
      {active.length > 0 ? (
        <List disablePadding sx={{ pb: 0.5 }}>
          {active.map((comp, i) => (
            <Box key={comp.id} sx={i > 0 ? rowDivider : undefined}>
              <CompetitionRow comp={comp} />
            </Box>
          ))}
        </List>
      ) : (
        <Empty text="Run a monthly medal or Stableford with your group." action="Start a competition" to="/competitions" />
      )}
    </RailSection>
  )
}

/** Friend suggestions with one-tap Add. Renders nothing when there are none. */
export function PeopleYouMayKnowCard() {
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
    <RailSection title="People you may know" icon={<GroupAddIcon sx={iconSx} />} seeAllTo="/friends?tab=add">
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
    </RailSection>
  )
}

/** Share-your-invite-link prompt. */
export function InviteCard() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Paper elevation={0} sx={{ p: 2, mb: 2, bgcolor: tint(CLAY.green, 0.07) }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>Bring your group</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Anyone who joins with your link is added as a friend.
        </Typography>
        <Button size="small" variant="contained" startIcon={<LinkIcon />} onClick={() => setOpen(true)}>
          Share invite link
        </Button>
      </Paper>
      <InviteFriendsDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/** Your last few completed rounds, with the score coloured like History. */
export function RecentRoundsCard() {
  const navigate = useNavigate()
  const { data: rounds } = useQuery({ queryKey: ['rounds'], queryFn: getRounds })
  const recent = (rounds ?? []).filter((r) => r.totalStrokes != null).slice(0, 4)

  return (
    <RailSection title="Recent rounds" icon={<HistoryIcon sx={iconSx} />} seeAllTo="/history">
      {recent.length > 0 ? (
        <List disablePadding sx={{ pb: 0.5 }}>
          {recent.map((r, i) => {
            const band = r.scoreToPar != null ? scoreBand(r.scoreToPar) : null
            return (
              <Box key={r.id} sx={i > 0 ? rowDivider : undefined}>
                <ListItemButton dense onClick={() => navigate(`/rounds/${r.id}`)} sx={{ py: 0.75, gap: 1 }}>
                  <ListItemText
                    primary={formatCourseName(r.course?.name ?? 'Round')}
                    secondary={new Date(r.playedAt).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                    primaryTypographyProps={{ variant: 'body2', fontWeight: 600, noWrap: true }}
                    secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
                  />
                  <Typography className="tabular" sx={{ fontWeight: 800 }}>{r.totalStrokes}</Typography>
                  {band && (
                    <Chip
                      label={r.scoreToPar === 0 ? 'E' : r.scoreToPar! > 0 ? `+${r.scoreToPar}` : r.scoreToPar}
                      size="small"
                      sx={{ height: 20, minWidth: 36, fontSize: '0.7rem', fontWeight: 700, bgcolor: band.fill, color: band.on }}
                    />
                  )}
                </ListItemButton>
              </Box>
            )
          })}
        </List>
      ) : (
        <Empty text="Your scored rounds will show up here." action="Start a round" to="/play" />
      )}
    </RailSection>
  )
}

/** The single most pressing coaching tip from Stats. */
export function FocusCard() {
  const navigate = useNavigate()
  const { data: insights } = useQuery({ queryKey: ['insights'], queryFn: getInsights })
  const order = ['high', 'medium', 'low']
  const tip = [...(insights?.suggestions ?? [])].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))[0]

  return (
    <Paper elevation={0} sx={{ p: 2, mb: 2, bgcolor: tint(CLAY.gold, 0.1) }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
        <LightbulbIcon sx={{ fontSize: 18, color: CLAY.goldText }} />
        {tip ? `Work on: ${tip.area.toLowerCase()}` : 'Practice smarter'}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {tip
          ? tip.message
          : 'Track putts, greens and fairways as you score, and we’ll show you where the shots are going.'}
      </Typography>
      <Button size="small" onClick={() => navigate('/stats')} endIcon={<ArrowForwardIcon sx={{ fontSize: '0.9rem !important' }} />} sx={{ ml: -0.75 }}>
        See your stats
      </Button>
    </Paper>
  )
}

/** Your friends with their handicaps — who to ask out for a game. */
export function FriendsCard() {
  const navigate = useNavigate()
  const { data: friends } = useQuery({ queryKey: ['friends'], queryFn: getFriends })
  const shown = (friends ?? []).slice(0, 5)

  return (
    <RailSection title="Your friends" icon={<PeopleIcon sx={iconSx} />} seeAllTo="/friends">
      {shown.length > 0 ? (
        <List disablePadding sx={{ pb: 0.5 }}>
          {shown.map((f) => (
            <ListItemButton key={f.id} dense onClick={() => navigate(`/profile/${f.id}`)} sx={{ py: 0.75, gap: 1.25 }}>
              <UserAvatar userId={f.id} name={f.name} size={30} link={false} />
              <ListItemText
                primary={f.name}
                primaryTypographyProps={{ variant: 'body2', fontWeight: 600, noWrap: true }}
              />
              <Typography variant="caption" color="text.secondary" className="tabular">
                {f.handicapIndex != null ? formatHandicap(f.handicapIndex) : '–'}
              </Typography>
            </ListItemButton>
          ))}
        </List>
      ) : (
        <Empty text="Add the people you play with." action="Find friends" to="/friends?tab=add" />
      )}
    </RailSection>
  )
}

const FORMATS = [
  { name: 'Net', text: 'Strokes minus your handicap allowance, so everyone has a fair shot.' },
  { name: 'Gross', text: 'Lowest raw score wins. No strokes given.' },
  { name: 'Stableford', text: 'Points per hole against your net par. One bad hole won’t ruin the card.' },
]

/** What the three scoring formats mean, for anyone setting one up. */
export function CompetitionFormatsCard() {
  return (
    <RailSection title="Scoring formats" icon={<EmojiEventsIcon sx={{ fontSize: 18, color: CLAY.goldGraphic }} />}>
      <Box sx={{ px: 2, pb: 1.5 }}>
        {FORMATS.map((f, i) => (
          <Box key={f.name} sx={{ py: 1, ...(i > 0 ? rowDivider : {}) }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>{f.name}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{f.text}</Typography>
          </Box>
        ))}
      </Box>
    </RailSection>
  )
}
