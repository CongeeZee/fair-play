import { AppBar, Toolbar, Typography, Button, Box, Badge, Avatar, IconButton, Tooltip, useScrollTrigger } from '@mui/material'
import GolfCourseIcon from '@mui/icons-material/GolfCourse'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { useAppearance } from '../contexts/AppearanceContext'
import { useUnits } from '../contexts/UnitsContext'
import { getFriendRequests } from '../api/friends'

/**
 * Light/dark switch. The app has no settings page to bury it in, and it sits
 * in the bar at every screen size — including mobile, which is the size that
 * actually goes outdoors and comes back in again.
 *
 * The icon shows the mode you would get by pressing it, not the one you are
 * in: a toggle that pictures the current state gives you nothing you cannot
 * already see by looking at the page. `aria-label` says the same thing in
 * words, and there is no `aria-pressed` — this is an action, not a state, so
 * a pressed-pill treatment would be claiming something the icon contradicts.
 */
function AppearanceToggle() {
  const { appearance, toggleAppearance } = useAppearance()
  const dark = appearance === 'dark'
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <Tooltip title={label}>
      <IconButton
        onClick={toggleAppearance}
        aria-label={label}
        size="small"
        sx={{
          color: 'rgba(255,255,255,0.86)',
          borderRadius: 999,
          '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.1)' },
        }}
      >
        {dark
          ? <LightModeIcon sx={{ fontSize: 20 }} />
          : <DarkModeIcon sx={{ fontSize: 20 }} />}
      </IconButton>
    </Tooltip>
  )
}

/**
 * Yards / metres.
 *
 * Unlike the light/dark button next to it, this shows the state you are IN, not
 * the one you would switch to: the whole job of the control is to tell you how
 * to read the numbers already on screen. Showing the other unit would make
 * every yardage on the page ambiguous.
 *
 * It lives in the bar for the same reason the appearance toggle does — there is
 * no settings page, and a unit preference is useless if you have to hunt for it
 * standing on the tee.
 */
function UnitsToggle() {
  const { unit, toggleUnit, unitLabel } = useUnits()
  const other = unit === 'yards' ? 'metres' : 'yards'

  return (
    <Tooltip title={`Distances in ${unit} — switch to ${other}`}>
      <Button
        onClick={toggleUnit}
        aria-label={`Distance units: ${unit}. Switch to ${other}.`}
        size="small"
        sx={{
          minWidth: 0,
          px: 1,
          py: 0.25,
          borderRadius: 999,
          color: 'rgba(255,255,255,0.86)',
          fontWeight: 700,
          fontSize: '0.72rem',
          lineHeight: 1.4,
          textTransform: 'none',
          '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.1)' },
        }}
      >
        {unitLabel}
      </Button>
    </Tooltip>
  )
}

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
        // A moulded slab rather than a flat bar: soft gradient face plus a top
        // inset highlight, so the bar reads as moulded like the cards below it.
        // Driven by the palette custom properties so the bar follows the
        // appearance with the rest of the app.
        // The gradient used to run greenMid → green, so the *top* of the bar
        // was its lightest point (#468262) and every white foreground on it
        // measured against that: 78% white came out at 3.45:1 and even full
        // white at 4.54:1. axe missed it because `background` is a
        // background-*image*, so getComputedStyle reports backgroundColor as
        // transparent and the check walks up to the page base instead.
        // Running green → greenDark keeps the moulded top-lit look while
        // making the lightest stop #2f6b4c, where full white is 6.31:1.
        background: solid
          ? 'linear-gradient(180deg, var(--c-green) 0%, var(--c-greenDark) 100%)'
          : 'transparent',
        backdropFilter: !solid ? 'blur(10px)' : 'none',
        borderBottom: !solid
          ? '1px solid rgba(255,255,255,0.1)'
          // --c-borderW/--c-borderC give the bar a hard edge: 2px near-black
          // in light mode, a 1px slate hairline in dark.
          : 'var(--c-borderW) solid var(--c-borderC)',
        boxShadow: solid
          ? '0 calc(8px * var(--c-depth)) calc(24px * var(--c-depth)) 0 rgba(31, 74, 52, 0.28), inset 0 1px 0 0 rgba(255,255,255,0.16)'
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
                  // Active tab becomes a pressed-in pill, in place of the old
                  // gold underline.
                  // `goldLight` is 4.39:1 on the bar — under AA by a whisker.
                  // `goldOnGreen` exists for exactly this backdrop (4.70:1),
                  // and 86% white gives the inactive links 5.15:1 instead of
                  // the 4.55:1 that 78% left, which was passing on ~1% of
                  // headroom.
                  color: active ? 'var(--c-goldOnGreen)' : 'rgba(255,255,255,0.86)',
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

        <Box sx={{ mr: { xs: 0.5, md: 1.5 }, display: 'flex', alignItems: 'center', gap: { xs: 0.25, md: 0.5 } }}>
          <UnitsToggle />
          <AppearanceToggle />
        </Box>

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
              // `inherit` matters: the theme gives outlined buttons a page-surface
              // fill so they read as raised clay, and this one sits on the green
              // bar with white text. Left as the default `primary`, it got the
              // cream fill under white text and measured 1.06:1 — a rectangle
              // with an invisible label.
              color="inherit"
              onClick={handleLogout}
              sx={{
                display: { xs: 'none', md: 'inline-flex' },
                color: '#fff',
                // The border is the only thing that makes this read as a
                // button, so 1.4.11 applies to it at 3:1. 30% white was
                // 1.92:1 against the bar — a control outlined in something
                // you cannot see is just a word.
                borderColor: 'rgba(255,255,255,0.6)',
                fontSize: '0.8rem',
                '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.12)' },
              }}
            >
              Sign out
            </Button>
          </Box>
        )}

        {!user && (
          /* `alignItems: center` is what actually lets Get Started be smaller.
             A flex row defaults to `stretch`, so the gold pill was being pulled
             up to the height of the Sign In button beside it — shrinking its
             own padding changed its width and nothing else. */
          <Box sx={{ display: 'flex', gap: { xs: 0.5, md: 1 }, alignItems: 'center' }}>
            <Button
              component={Link}
              to="/login"
              size="small"
              sx={{
                color: 'rgba(255,255,255,0.86)',
                '&:hover': { color: '#fff' },
                // Stepped down with Get Started so the pair still reads as a
                // pair. Shrinking only one of them looks like a mistake.
                fontSize: { xs: '0.72rem', md: '0.875rem' },
                px: { xs: 0.75, md: 1.75 },
                minHeight: { xs: 30, md: 36 },
              }}
            >
              Sign In
            </Button>
            <Button
              variant="contained"
              color="secondary"
              component={Link}
              to="/register"
              size="small"
              /* A filled gold pill is the heaviest thing in the bar, and at
                 the desktop size it took up a quarter of a 390px toolbar next
                 to the wordmark, the appearance toggle and Sign In. It steps
                 down on xs and is unchanged from md up. 30px still clears the
                 24px minimum target size comfortably. */
              sx={{
                fontSize: { xs: '0.72rem', md: '0.8125rem' },
                px: { xs: 1.25, md: 2 },
                minHeight: { xs: 30, md: 36 },
              }}
            >
              Get Started
            </Button>
          </Box>
        )}
      </Toolbar>
    </AppBar>
  )
}
