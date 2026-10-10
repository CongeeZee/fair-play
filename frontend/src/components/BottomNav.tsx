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
import { CLAY, tint } from '../theme'

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
      component="nav"
      aria-label="Main"
      elevation={0}
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1200,
        display: { xs: 'block', md: 'none' },
        borderRadius: 0,
        border: 0,
        borderTop: '1px solid var(--c-borderC)',
        // Frosted, matching the top bar, so content scrolling underneath stays
        // faintly visible instead of being cut off by a solid slab.
        bgcolor: `color-mix(in srgb, ${CLAY.surface} 82%, transparent)`,
        backdropFilter: 'saturate(180%) blur(16px)',
        WebkitBackdropFilter: 'saturate(180%) blur(16px)',
      }}
    >
      <BottomNavigation
        showLabels
        value={currentValue === -1 ? false : currentValue}
        sx={{
          bgcolor: 'transparent',
          height: `calc(64px + env(safe-area-inset-bottom, 0px))`,
          pb: 'env(safe-area-inset-bottom, 0px)',
          '& .MuiBottomNavigationAction-root': {
            color: CLAY.inkSoft,
            minWidth: 0,
            pt: 1,
            gap: 0.25,
            // Material-3 style: the active tab gets a tonal pill behind its
            // icon rather than a filled tile, so the label stays on the page.
            '& .MuiSvgIcon-root': {
              width: 56, height: 30, px: 2, py: 0.5, borderRadius: 999,
              transition: 'background-color .2s ease',
            },
            '&.Mui-selected': {
              color: CLAY.greenText,
              '& .MuiSvgIcon-root': { bgcolor: tint(CLAY.green, 0.14) },
            },
          },
          '& .MuiBottomNavigationAction-label': {
            fontSize: '0.7rem',
            fontWeight: 600,
            '&.Mui-selected': { fontSize: '0.7rem', fontWeight: 700 },
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
