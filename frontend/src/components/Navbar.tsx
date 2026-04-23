import { AppBar, Toolbar, Typography, Button, Box, useScrollTrigger } from '@mui/material'
import GolfCourseIcon from '@mui/icons-material/GolfCourse'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

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

  const navLinks = [
    { label: 'Courses', to: '/courses' },
    { label: 'History', to: '/history' },
    { label: 'Stats', to: '/stats' },
  ]

  const solid = !isHome || scrolled

  return (
    <AppBar
      position="fixed"
      elevation={solid ? 2 : 0}
      sx={{
        bgcolor: solid ? '#1a3a2a' : 'transparent',
        backdropFilter: !solid ? 'blur(10px)' : 'none',
        borderBottom: !solid ? '1px solid rgba(255,255,255,0.1)' : 'none',
        transition: 'background-color 0.3s ease, box-shadow 0.3s ease',
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
          Fairway
        </Typography>

        {/* Desktop nav links — hidden on mobile (BottomNav handles it) */}
        {user && (
          <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 0.5, flexGrow: 1, alignItems: 'center' }}>
            {navLinks.map(({ label, to }) => (
              <Button
                key={to}
                color="inherit"
                component={Link}
                to={to}
                sx={{
                  fontSize: '0.875rem',
                  fontWeight: pathname === to ? 700 : 400,
                  opacity: pathname === to ? 1 : 0.75,
                  borderBottom: pathname === to ? '2px solid #c9a84c' : '2px solid transparent',
                  borderRadius: 0,
                  pb: '2px',
                  '&:hover': { opacity: 1, bgcolor: 'rgba(255,255,255,0.08)' },
                }}
              >
                {label}
              </Button>
            ))}
          </Box>
        )}

        {!user && <Box sx={{ flexGrow: 1 }} />}

        {/* On mobile with user, push sign-out to right */}
        {user && <Box sx={{ display: { xs: 'block', md: 'none' }, flexGrow: 1 }} />}

        {user && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, md: 2 } }}>
            <Typography variant="body2" sx={{ color: 'secondary.main', fontWeight: 600, display: { xs: 'none', sm: 'block' } }}>
              {user.name}
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={handleLogout}
              sx={{
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
