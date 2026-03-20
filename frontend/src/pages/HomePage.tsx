import { Box, Typography, Button } from '@mui/material'
import GolfCourseIcon from '@mui/icons-material/GolfCourse'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function HomePage() {
  const { user } = useAuth()

  return (
    <Box
      sx={{
        minHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        px: 2,
      }}
    >
      <GolfCourseIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
      <Typography variant="h2" color="primary.main" gutterBottom>
        Fairway
      </Typography>
      <Typography variant="h6" color="text.secondary" sx={{ mb: 4, maxWidth: 480 }}>
        Track your golf rounds, analyse your game, and improve your score.
      </Typography>
      <Box sx={{ display: 'flex', gap: 2 }}>
        {user ? (
          <Button variant="contained" color="primary" component={Link} to="/courses" size="large">
            Find a Course
          </Button>
        ) : (
          <>
            <Button variant="contained" color="primary" component={Link} to="/login" size="large">
              Sign In
            </Button>
            <Button variant="outlined" color="primary" component={Link} to="/register" size="large">
              Create Account
            </Button>
          </>
        )}
      </Box>
    </Box>
  )
}
