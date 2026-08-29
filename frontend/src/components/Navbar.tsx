import { AppBar, Toolbar, Typography, Button, Box, Badge, Avatar, useScrollTrigger } from '@mui/material'
import GolfCourseIcon from '@mui/icons-material/GolfCourse'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { getFriendRequests } from '../api/friends'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const isHome = pathname === '/'

  // Become solid when the user scrolls down on the home page
  const scrolled = useScrollTrigger({ disableHysteresis: true, threshold: 80 })

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const { data: friendRequests } = useQuery({
    queryKey: ['friend-requests'],
    queryFn: getFriendRequests,
    enabled: !!user?.emailVerified,
    refetchInterval: 60_000,
  })
  const pendingCount = friendRequests?.length ?? 0

  const navLinks = [
    { label: 'Feed', to: '/feed', matches: ['/feed'], badge: 0 },
    { label: 'Play', to: '/play', matches: ['/play', '/courses', '/teetimes'], badge: 0 },
    { label: 'Comps', to: '/competitions', matches: ['/competitions'], badge: 0 },
    { label: 'History', to: '/history', matches: ['/history'], badge: 0 },
    { label: 'Stats', to: '/stats', matches: ['/stats'], badge: 0 },
    { label: 'Friends', to: '/friends', matches: ['/friends'], badge: pendingCount },
  ]

  const solid = !isHome || scrolled

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        // A clay slab rather than a flat bar: soft gradient face plus a top
        // inset highlight, so the bar reads as moulded like the cards below it.
        background: solid
          ? 'linear-gradient(180deg, #37795a 0%, #2f6b4c 100%)'
          : 'transparent',
        backdropFilter: !solid ? 'blur(10px)' : 'none',
        borderBottom: !solid ? '1px solid rgba(255,255,255,0.1)' : 'none',
        boxShadow: solid
          ? '0 8px 24px 0 rgba(31, 74, 52, 0.28), inset 0 1px 0 0 rgba(255,255,255,0.16)'
          : 'none',
        transition: 'background 0.3s ease, box-shadow 0.3s ease',
      }}
    >
      <Toolbar sx={{ px: { xs: 2, md: 4 } }}>
        <GolfCourseIcon sx={{ mr: 1, color: 'secondary.main', fontSize: 22 }} />
        <Typography
          variant="h6"
          component={Link}
          to="/"
          sx={{
            flexGrow: 0,
            textDecoration: 'none',
            color: '#fff',
            mr: { xs: 'auto', md: 4 },
            fontFamily: '"Playfair Display", serif',
            fontSize: '1.25rem',
            letterSpacing: '0.5px',
          }}
        >
          Fairplay
        </Typography>

        {/* Desktop nav links — hidden on mobile (BottomNav handles it) */}
        {user && (
          <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 0.5, flexGrow: 1, alignItems: 'center' }}>
            {navLinks.map(({ label, to, matches, badge }) => {
              const active = matches.some((p) => pathname.startsWith(p))
              return (
              <Button
                key={to}
                color="inherit"
                component={Link}
                to={to}
                sx={{
                  fontSize: '0.875rem',
                  fontWeight: active ? 700 : 500,
                  // Active tab becomes a pressed-in pill — the clay equivalent
                  // of the old gold underline.
                  color: active ? '#f2d492' : 'rgba(255,255,255,0.78)',
                  borderRadius: 999,
                  px: 2,
                  py: 0.6,
                  minWidth: 0,
                  boxShadow: active
                    ? 'inset 2px 2px 6px 0 rgba(19,48,33,0.55), inset -2px -2px 6px 0 rgba(255,255,255,0.12)'
                    : 'none',
                  bgcolor: active ? 'rgba(19,48,33,0.28)' : 'transparent',
                  '&:hover': {
                    color: '#fff',
                    bgcolor: active ? 'rgba(19,48,33,0.32)' : 'rgba(255,255,255,0.1)',
                  },
                }}
              >
                {badge > 0 ? <Badge badgeContent={badge} color="error" sx={{ '& .MuiBadge-badge': { right: -10, top: -2 } }}>{label}</Badge> : label}
              </Button>
              )
            })}
          </Box>
        )}

        {!user && <Box sx={{ flexGrow: 1 }} />}

        {/* On mobile with user, push sign-out to right */}
        {user && <Box sx={{ display: { xs: 'block', md: 'none' }, flexGrow: 1 }} />}

        {user && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, md: 2 } }}>
            <Typography
              variant="body2"
              component={Link}
              to="/profile/me"
              sx={{
                color: 'secondary.main', fontWeight: 600, display: { xs: 'none', md: 'block' },
                textDecoration: 'none', '&:hover': { textDecoration: 'underline' },
              }}
            >
              {user.name}
            </Typography>
            {/* Mobile: avatar links to profile — the only route to Profile,
                Stats and Sign out on small screens (BottomNav is full) */}
            <Avatar
              component={Link}
              to="/profile/me"
              aria-label="your profile"
              sx={{
                display: { xs: 'flex', md: 'none' },
                width: 32,
                height: 32,
                bgcolor: 'secondary.main',
                color: 'primary.main',
                fontSize: '0.9rem',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              {user.name?.charAt(0).toUpperCase() || '?'}
            </Avatar>
            <Button
              variant="outlined"
              size="small"
              onClick={handleLogout}
              sx={{
                display: { xs: 'none', md: 'inline-flex' },
                color: 'rgba(255,255,255,0.8)',
                borderColor: 'rgba(255,255,255,0.3)',
                fontSize: '0.8rem',
                '&:hover': { borderColor: '#fff', color: '#fff', bgcolor: 'rgba(255,255,255,0.08)' },
              }}
            >
              Sign out
            </Button>
          </Box>
        )}

        {!user && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              component={Link}
              to="/login"
              sx={{ color: 'rgba(255,255,255,0.8)', '&:hover': { color: '#fff' } }}
            >
              Sign In
            </Button>
            <Button
              variant="contained"
              color="secondary"
              component={Link}
              to="/register"
              size="small"
            >
              Get Started
            </Button>
          </Box>
        )}
      </Toolbar>
    </AppBar>
  )
}
