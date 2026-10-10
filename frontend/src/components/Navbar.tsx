import { useState } from 'react'
import { AppBar, Toolbar, Typography, Button, Box, Badge, IconButton, Tooltip, Menu, MenuItem, ListItemIcon, Divider, useScrollTrigger } from '@mui/material'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import LogoutIcon from '@mui/icons-material/Logout'
import GolfCourseIcon from '@mui/icons-material/GolfCourse'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { useAppearance } from '../contexts/AppearanceContext'
import { useUnits } from '../contexts/UnitsContext'
import { getFriendRequests } from '../api/friends'
import NotificationBell from './NotificationBell'
import UserAvatar from './UserAvatar'
import { HEADING_FONT, tint, CLAY } from '../theme'

/**
 * Colours for whatever the bar is sitting on. Over the home hero the bar is
 * transparent on a dark photo, so everything is white; everywhere else it is a
 * frosted light (or dark) surface and takes the page ink.
 */
function barInk(overHero: boolean) {
  return overHero
    ? { fg: 'rgba(255,255,255,0.9)', fgStrong: '#fff', hover: 'rgba(255,255,255,0.12)' }
    : { fg: CLAY.inkSoft, fgStrong: CLAY.ink, hover: 'var(--c-actionHover)' }
}

/**
 * Light/dark switch. The icon shows the mode you would get by pressing it, not
 * the one you are in: a toggle that pictures the current state gives you
 * nothing you cannot already see by looking at the page.
 */
function AppearanceToggle({ overHero }: { overHero: boolean }) {
  const { appearance, toggleAppearance } = useAppearance()
  const dark = appearance === 'dark'
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode'
  const ink = barInk(overHero)

  return (
    <Tooltip title={label}>
      <IconButton
        onClick={toggleAppearance}
        aria-label={label}
        size="small"
        sx={{ color: ink.fg, borderRadius: 999, '&:hover': { color: ink.fgStrong, bgcolor: ink.hover } }}
      >
        {dark ? <LightModeIcon sx={{ fontSize: 20 }} /> : <DarkModeIcon sx={{ fontSize: 20 }} />}
      </IconButton>
    </Tooltip>
  )
}

/**
 * Yards / metres. Unlike the appearance toggle this shows the state you are IN:
 * the whole job of the control is to tell you how to read the numbers already
 * on screen.
 */
function UnitsToggle({ overHero }: { overHero: boolean }) {
  const { unit, toggleUnit, unitLabel } = useUnits()
  const other = unit === 'yards' ? 'metres' : 'yards'
  const ink = barInk(overHero)

  return (
    <Tooltip title={`Distances in ${unit} — switch to ${other}`}>
      <Button
        onClick={toggleUnit}
        aria-label={`Distance units: ${unit}. Switch to ${other}.`}
        size="small"
        sx={{
          minWidth: 0, px: 1, py: 0.25, borderRadius: 999,
          color: ink.fg, fontWeight: 700, fontSize: '0.72rem', lineHeight: 1.4,
          '&:hover': { color: ink.fgStrong, bgcolor: ink.hover },
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

  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const isHome = pathname === '/'
  // On the home page the bar floats over the hero until you scroll past it
  const scrolled = useScrollTrigger({ disableHysteresis: true, threshold: 80 })
  const overHero = isHome && !scrolled
  const ink = barInk(overHero)

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
    { label: 'Stats', to: '/stats', matches: ['/stats', '/history'], badge: 0 },
    { label: 'Friends', to: '/friends', matches: ['/friends'], badge: pendingCount },
  ]

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        color: ink.fgStrong,
        // Frosted surface: the page scrolls visibly underneath, which is what
        // makes a fixed bar read as part of the page rather than a lid on it.
        bgcolor: overHero ? 'transparent' : `color-mix(in srgb, ${CLAY.surface} 78%, transparent)`,
        backdropFilter: overHero ? 'none' : 'saturate(180%) blur(16px)',
        WebkitBackdropFilter: overHero ? 'none' : 'saturate(180%) blur(16px)',
        borderBottom: '1px solid',
        borderColor: overHero ? 'transparent' : 'var(--c-borderC)',
        boxShadow: 'none',
        transition: 'background-color .3s ease, border-color .3s ease',
      }}
    >
      <Toolbar sx={{ px: { xs: 2, md: 4 }, gap: 1 }}>
        <Box
          component={Link}
          to={user ? '/feed' : '/'}
          sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none', mr: { xs: 'auto', md: 3 } }}
        >
          <Box sx={{
            width: 32, height: 32, borderRadius: 2.5, display: 'grid', placeItems: 'center',
            bgcolor: 'primary.main', color: CLAY.goldOnGreen,
          }}>
            <GolfCourseIcon sx={{ fontSize: 19 }} />
          </Box>
          <Typography sx={{
            fontFamily: HEADING_FONT, fontWeight: 800, fontSize: '1.2rem',
            letterSpacing: '-0.02em', color: ink.fgStrong,
          }}>
            Fairplay
          </Typography>
        </Box>

        {/* Desktop nav links — mobile uses the bottom nav */}
        {user && (
          <Box component="nav" sx={{ display: { xs: 'none', md: 'flex' }, gap: 0.5, flexGrow: 1, alignItems: 'center' }}>
            {navLinks.map(({ label, to, matches, badge }) => {
              const active = matches.some((p) => pathname.startsWith(p))
              return (
                <Button
                  key={to}
                  component={Link}
                  to={to}
                  aria-current={active ? 'page' : undefined}
                  sx={{
                    fontSize: '0.9rem',
                    fontWeight: active ? 700 : 500,
                    color: active ? CLAY.greenText : ink.fg,
                    bgcolor: active ? tint(CLAY.green, 0.12) : 'transparent',
                    borderRadius: 999,
                    px: 2, py: 0.6, minWidth: 0,
                    '&:hover': { color: active ? CLAY.greenText : ink.fgStrong, bgcolor: active ? tint(CLAY.green, 0.16) : ink.hover },
                  }}
                >
                  {badge > 0
                    ? <Badge badgeContent={badge} color="error" sx={{ '& .MuiBadge-badge': { right: -10, top: -2 } }}>{label}</Badge>
                    : label}
                </Button>
              )
            })}
          </Box>
        )}

        {!user && <Box sx={{ flexGrow: 1 }} />}

        {/* Signed in, these live in Settings. Signed out there is no settings
            page, so the bar keeps them — except on a phone, where there is no
            room next to the two auth buttons. */}
        {!user && (
          <Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 0.5 }}>
            <UnitsToggle overHero={overHero} />
            <AppearanceToggle overHero={overHero} />
          </Box>
        )}

        {user && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, ml: { xs: 0.5, md: 1 } }}>
            {user.emailVerified && <NotificationBell color={ink.fg} />}
            <Tooltip title="Account">
              <IconButton
                onClick={(e) => setMenuAnchor(e.currentTarget)}
                aria-label="Account menu"
                aria-haspopup="true"
                aria-expanded={!!menuAnchor}
                sx={{ p: 0.25 }}
              >
                <UserAvatar userId={Number(user.id)} name={user.name} size={34} link={false} />
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={menuAnchor}
              open={!!menuAnchor}
              onClose={() => setMenuAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              slotProps={{ paper: { sx: { minWidth: 220, mt: 1 } } }}
            >
              <Box sx={{ px: 2, py: 1 }}>
                <Typography sx={{ fontWeight: 700 }} noWrap>{user.name}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{user.email}</Typography>
              </Box>
              <Divider sx={{ my: 0.5 }} />
              <MenuItem component={Link} to="/profile/me" onClick={() => setMenuAnchor(null)}>
                <ListItemIcon><PersonOutlineIcon fontSize="small" /></ListItemIcon>Profile
              </MenuItem>
              <MenuItem component={Link} to="/settings" onClick={() => setMenuAnchor(null)}>
                <ListItemIcon><SettingsOutlinedIcon fontSize="small" /></ListItemIcon>Settings
              </MenuItem>
              <MenuItem onClick={() => { setMenuAnchor(null); handleLogout() }}>
                <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>Sign out
              </MenuItem>
            </Menu>
          </Box>
        )}

        {!user && (
          <Box sx={{ display: 'flex', gap: { xs: 0.5, md: 1 }, alignItems: 'center' }}>
            <Button
              component={Link}
              to="/login"
              size="small"
              sx={{
                color: ink.fg, '&:hover': { color: ink.fgStrong, bgcolor: ink.hover },
                fontSize: { xs: '0.78rem', md: '0.875rem' },
                px: { xs: 1, md: 1.75 },
              }}
            >
              Sign in
            </Button>
            <Button
              variant="contained"
              color={overHero ? 'secondary' : 'primary'}
              component={Link}
              to="/register"
              size="small"
              sx={{ fontSize: { xs: '0.78rem', md: '0.85rem' }, px: { xs: 1.5, md: 2 }, minHeight: { xs: 32, md: 36 }, whiteSpace: 'nowrap' }}
            >
              Get started
            </Button>
          </Box>
        )}
      </Toolbar>
    </AppBar>
  )
}
