import { AppBar, Toolbar, Typography, Button, Box } from '@mui/material'
import GolfCourseIcon from '@mui/icons-material/GolfCourse'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const isHome = pathname === '/'

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const navLinks = [
    { label: 'Courses', to: '/courses' },
    { label: 'History', to: '/history' },
    { label: 'Stats', to: '/stats' },
  ]

  return (
    <AppBar
      position="fixed"
      elevation={isHome ? 0 : 2}
      sx={{
        bgcolor: isHome ? 'transparent' : '#1a3a2a',
        backdropFilter: isHome ? 'blur(10px)' : 'none',
        borderBottom: isHome ? '1px solid rgba(255,255,255,0.1)' : 'none',
        transition: 'background-color 0.3s ease',
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
            mr: 4,
            fontFamily: '"Playfair Display", serif',
            fontSize: '1.25rem',
            letterSpacing: '0.5px',
          }}
        >
          Fairway
        </Typography>

        {user && (
          <Box sx={{ display: 'flex', gap: 0.5, flexGrow: 1, alignItems: 'center' }}>
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

        {user && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2" sx={{ color: 'secondary.main', fontWeight: 600 }}>
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
