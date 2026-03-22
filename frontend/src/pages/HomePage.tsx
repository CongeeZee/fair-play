import { Box, Typography, Button, Container, Grid } from '@mui/material'
import GolfCourseIcon from '@mui/icons-material/GolfCourse'
import TrackChangesIcon from '@mui/icons-material/TrackChanges'
import BarChartIcon from '@mui/icons-material/BarChart'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1592919505780-303950717480?auto=format&fit=crop&w=1920&q=80'

const features = [
  {
    icon: <TrackChangesIcon sx={{ fontSize: 32, color: '#c9a84c' }} />,
    title: 'Track Every Round',
    body: 'Log scores hole-by-hole for any real course, from Pebble Beach to your local club.',
  },
  {
    icon: <EmojiEventsIcon sx={{ fontSize: 32, color: '#c9a84c' }} />,
    title: 'Official Handicap',
    body: 'Your WHS Handicap Index is calculated automatically from your round history.',
  },
  {
    icon: <BarChartIcon sx={{ fontSize: 32, color: '#c9a84c' }} />,
    title: 'Analyse Your Game',
    body: 'Score trends, hole breakdowns, and stats that show you where to improve.',
  },
]

export default function HomePage() {
  const { user } = useAuth()

  return (
    <Box>
      {/* Hero */}
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          px: 3,
          position: 'relative',
          backgroundImage: `
            linear-gradient(to bottom, rgba(10,25,16,0.55) 0%, rgba(10,25,16,0.75) 60%, rgba(10,25,16,0.92) 100%),
            url('${HERO_IMAGE}')
          `,
          backgroundSize: 'cover',
          backgroundPosition: 'center 70%',
        }}
      >
        <GolfCourseIcon sx={{ fontSize: 52, color: '#c9a84c', mb: 2, opacity: 0.9 }} />

        <Typography
          variant="h1"
          sx={{
            color: '#fff',
            fontSize: { xs: '3.5rem', sm: '5rem', md: '6.5rem' },
            fontWeight: 700,
            letterSpacing: '-1px',
            lineHeight: 1,
            mb: 2,
            textShadow: '0 2px 20px rgba(0,0,0,0.4)',
          }}
        >
          Fairway
        </Typography>

        <Typography
          variant="h5"
          sx={{
            color: 'rgba(255,255,255,0.75)',
            fontWeight: 300,
            fontFamily: '"Source Sans 3", sans-serif',
            maxWidth: 480,
            mb: 6,
            lineHeight: 1.5,
          }}
        >
          Track your rounds. Know your handicap. Elevate your game.
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
          {user ? (
            <Button
              variant="contained"
              color="secondary"
              component={Link}
              to="/courses"
              size="large"
              sx={{ px: 5, py: 1.5, fontSize: '1rem' }}
            >
              Find a Course
            </Button>
          ) : (
            <>
              <Button
                variant="contained"
                color="secondary"
                component={Link}
                to="/register"
                size="large"
                sx={{ px: 5, py: 1.5, fontSize: '1rem' }}
              >
                Get Started
              </Button>
              <Button
                variant="outlined"
                component={Link}
                to="/login"
                size="large"
                sx={{
                  px: 5, py: 1.5, fontSize: '1rem',
                  color: '#fff',
                  borderColor: 'rgba(255,255,255,0.45)',
                  '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.08)' },
                }}
              >
                Sign In
              </Button>
            </>
          )}
        </Box>

        {/* Feature strip pinned to bottom of hero */}
        <Box
          sx={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            borderTop: '1px solid rgba(255,255,255,0.1)',
            bgcolor: 'rgba(10,25,16,0.75)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <Container maxWidth="lg">
            <Grid container>
              {features.map((f, i) => (
                <Grid
                  key={f.title}
                  size={{ xs: 12, md: 4 }}
                  sx={{
                    py: 3,
                    px: 4,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 2,
                    borderLeft: { md: i > 0 ? '1px solid rgba(255,255,255,0.1)' : 'none' },
                    borderTop: { xs: i > 0 ? '1px solid rgba(255,255,255,0.1)' : 'none', md: 'none' },
                  }}
                >
                  {f.icon}
                  <Box sx={{ textAlign: 'left' }}>
                    <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 600, mb: 0.25 }}>
                      {f.title}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
                      {f.body}
                    </Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>
      </Box>
    </Box>
  )
}
