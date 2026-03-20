import { AppBar, Toolbar, Typography, Button, Box } from '@mui/material'
import GolfCourseIcon from '@mui/icons-material/GolfCourse'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <AppBar position="sticky">
      <Toolbar>
        <GolfCourseIcon sx={{ mr: 1, color: 'secondary.main' }} />
        <Typography
          variant="h6"
          component={Link}
          to="/"
          sx={{ flexGrow: 0, textDecoration: 'none', color: 'primary.contrastText', mr: 3, fontFamily: '"Playfair Display", serif' }}
        >
          Fairway
        </Typography>

        {user && (
          <Box sx={{ display: 'flex', gap: 1, flexGrow: 1, alignItems: 'center' }}>
            <Button color="inherit" component={Link} to="/courses">
              Courses
            </Button>
            <Button color="inherit" component={Link} to="/history">
              History
            </Button>
            <Button color="inherit" component={Link} to="/stats">
              Stats
            </Button>
          </Box>
        )}

        {!user && <Box sx={{ flexGrow: 1 }} />}

        {user && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2" sx={{ color: 'secondary.main' }}>
              {user.name}
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={handleLogout}
              sx={{ color: 'primary.contrastText', borderColor: 'primary.contrastText' }}
            >
              Sign out
            </Button>
          </Box>
        )}
      </Toolbar>
    </AppBar>
  )
}
