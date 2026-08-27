import { Box, Button, Container, Paper, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function NotFoundPage() {
  const { user } = useAuth()
  // Signed-in players expect the app shell back; everyone else the landing page.
  const homeTo = user ? '/feed' : '/'

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper elevation={2} sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h4" color="primary.main" gutterBottom>
          Out of bounds
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          We couldn't find that page. It may have been moved, or the link might be
          mistyped.
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button component={Link} to={homeTo} variant="contained" color="primary">
            {user ? 'Back to feed' : 'Back to home'}
          </Button>
          {user && (
            <Button component={Link} to="/play" variant="outlined" color="primary">
              Start a round
            </Button>
          )}
        </Box>
      </Paper>
    </Container>
  )
}
