import { Paper, BottomNavigation, BottomNavigationAction, Badge } from '@mui/material'
import HomeIcon from '@mui/icons-material/Home'
import SportsGolfIcon from '@mui/icons-material/SportsGolf'
import InsightsIcon from '@mui/icons-material/Insights'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import PeopleIcon from '@mui/icons-material/People'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getFriendRequests } from '../api/friends'
import { useAuth } from '../contexts/AuthContext'

function FriendsIcon() {
  const { user } = useAuth()
  const { data: requests } = useQuery({
    queryKey: ['friend-requests'],
    queryFn: getFriendRequests,
    enabled: !!user?.emailVerified,
    refetchInterval: 60_000,
  })
  const count = requests?.length ?? 0
  return count > 0
    ? <Badge badgeContent={count} color="error"><PeopleIcon /></Badge>
    : <PeopleIcon />
}

const NAV_ITEMS = [
  { label: 'Feed', to: '/feed', matches: ['/feed'], icon: <HomeIcon /> },
  { label: 'Play', to: '/play', matches: ['/play', '/courses', '/teetimes'], icon: <SportsGolfIcon /> },
  { label: 'Comps', to: '/competitions', matches: ['/competitions'], icon: <EmojiEventsIcon /> },
  // Stats owns the slot; round history lives one tap inside the Stats page
  { label: 'Stats', to: '/stats', matches: ['/stats', '/history'], icon: <InsightsIcon /> },
  { label: 'Friends', to: '/friends', matches: ['/friends'], icon: <FriendsIcon /> },
]

export default function BottomNav() {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  const currentValue = NAV_ITEMS.findIndex((item) => item.matches.some((p) => pathname.startsWith(p)))

  return (
    <Paper
      elevation={0}
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1200,
        display: { xs: 'block', md: 'none' },
        // Rounded top corners + an upward shadow make the bar read as a clay
        // tray lifted off the page rather than a flat strip glued to the edge.
        borderTopLeftRadius: 26,
        borderTopRightRadius: 26,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        overflow: 'hidden',
        // Follows --c-shade so the bar casts a warm shadow on the light page
        // and a real black one in dark mode, where a warm grey glowed.
        boxShadow: '0 -8px 24px 0 var(--c-shade)',
      }}
    >
      <BottomNavigation
        value={currentValue === -1 ? false : currentValue}
        sx={{
          // Was `#37795a → #2f6b4c` in literal hex, which had two problems: the
          // bar did not follow the appearance, and its light stop carried the
          // 55% white labels at 2.74:1. Same invariant as the top bar now —
          // green down to greenDark, so the worst case is `green` itself.
          background: 'linear-gradient(180deg, var(--c-green) 0%, var(--c-greenDark) 100%)',
          boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.18)',
          height: `calc(60px + env(safe-area-inset-bottom, 0px))`,
          pb: 'env(safe-area-inset-bottom, 0px)',
          px: 0.75,
          '& .MuiBottomNavigationAction-root': {
            // 55% white was 2.85:1 even on the darkened bar. These are the
            // primary navigation labels on mobile — the one thing on screen
            // that has to be readable in sunlight on a course.
            color: 'rgba(255,255,255,0.88)',
            minWidth: 0,
            borderRadius: 18,
            mx: 0.25,
            my: 0.75,
            transition: 'background-color .2s ease, box-shadow .2s ease, color .2s ease',
            '&.Mui-selected': {
              // goldLight is 4.39:1 on the bar; goldOnGreen exists for this.
              color: 'var(--c-goldOnGreen)',
              bgcolor: 'rgba(19,48,33,0.3)',
              boxShadow: 'inset 2px 2px 6px 0 rgba(19,48,33,0.55), inset -2px -2px 6px 0 rgba(255,255,255,0.12)',
            },
          },
          '& .MuiBottomNavigationAction-label': {
            fontSize: '0.7rem',
            fontWeight: 600,
            '&.Mui-selected': {
              fontSize: '0.72rem',
            },
          },
        }}
      >
        {NAV_ITEMS.map((item) => (
          <BottomNavigationAction
            key={item.to}
            label={item.label}
            icon={item.icon}
            // Always navigate on tap — MUI's parent onChange only fires when the
            // value changes, which would strand users on detail pages like
            // /competitions/:id (tapping "Comps" wouldn't return to the list).
            onClick={() => navigate(item.to)}
          />
        ))}
      </BottomNavigation>
    </Paper>
  )
}
