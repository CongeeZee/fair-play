import { Box, Typography, Button, Container, Grid } from '@mui/material'
import GolfCourseIcon from '@mui/icons-material/GolfCourse'
import TrackChangesIcon from '@mui/icons-material/TrackChanges'
import BarChartIcon from '@mui/icons-material/BarChart'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1592919505780-303950717480?auto=format&fit=crop&w=1920&q=80'

const features = [
  {
    icon: <TrackChangesIcon sx={{ fontSize: 32, color: '#e0b95c' }} />,
    title: 'Track Every Round',
    body: 'Log scores hole-by-hole for any real course, from Pebble Beach to your local club.',
  },
  {
    icon: <EmojiEventsIcon sx={{ fontSize: 32, color: '#e0b95c' }} />,
    title: 'Official Handicap',
    body: 'Your WHS Handicap Index is calculated automatically from your round history.',
  },
  {
    icon: <BarChartIcon sx={{ fontSize: 32, color: '#e0b95c' }} />,
    title: 'Analyse Your Game',
    body: 'Score trends, hole breakdowns, and stats that show you where to improve.',
  },
]

export default function HomePage() {
  const { user } = useAuth()

  if (user) return <Navigate to="/feed" replace />

  return (
    <Box>
      {/* Hero */}
      <Box
        sx={{
          // On mobile the feature strip flows below the hero instead of
          // overlaying it, so the hero itself can be a bit shorter than the
          // full viewport — otherwise the CTAs sit under the strip.
          minHeight: { xs: '88svh', md: '100vh' },
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          px: 3,
          position: 'relative',
          backgroundImage: `
            /* The scrim is the only thing guaranteeing contrast here: the
               photo behind it is a fixed asset today but the safe assumption
               is a bright sky, and over pure white a 0.55 scrim flattens to
               #78807c, where the 75%-white subtitle measured 3.03:1. 0.70 is
               the shallowest top stop that keeps every foreground above AA
               against a white worst case (#fff 6.73:1, subtitle 5.67:1). */
            linear-gradient(to bottom, rgba(10,25,16,0.70) 0%, rgba(10,25,16,0.82) 60%, rgba(10,25,16,0.94) 100%),
            url('${HERO_IMAGE}')
          `,
          backgroundSize: 'cover',
          backgroundPosition: 'center 70%',
        }}
      >
        <GolfCourseIcon sx={{ fontSize: 52, color: '#e0b95c', mb: 2, opacity: 0.9 }} />

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
          Fairplay
        </Typography>

        <Typography
          variant="h5"
          sx={{
            color: 'rgba(255,255,255,0.88)',
            fontWeight: 300,
            fontFamily: '"Source Sans 3", sans-serif',
            maxWidth: 480,
            mb: 6,
            lineHeight: 1.5,
          }}
        >
          Track your rounds. Know your handicap. Elevate your game.
        </Typography>

        {/* The two CTAs were sized for the desktop hero and inherited straight
            onto a 375px phone, where `px: 5` on a `size="large"` button left
            them filling most of the width and reading as oversized slabs. They
            now step down on xs — still 44px tall, so the tap target is intact —
            and `nowrap` keeps "Get Started" on one line at the tighter padding
            rather than breaking into two and making the pair uneven. */}
        <Box sx={{ display: 'flex', gap: { xs: 1.5, sm: 2 }, flexWrap: 'wrap', justifyContent: 'center', '& .MuiButton-root': { whiteSpace: 'nowrap' } }}>
          <Button
            variant="contained"
            color="secondary"
            component={Link}
            to="/register"
            size="large"
            sx={{ px: { xs: 3, sm: 5 }, py: { xs: 1, sm: 1.5 }, fontSize: { xs: '0.9375rem', sm: '1rem' } }}
          >
            Get Started
          </Button>
          <Button
            variant="outlined"
            component={Link}
            to="/login"
            size="large"
            /* `inherit` is load-bearing, not decoration. The theme fills
               outlined buttons with the page surface so they read as a raised
               tile, scoped to the explicit colour variants — and this button,
               left on the default `primary`, matched that scope. The rule is
               `.css-root.MuiButton-colorPrimary`, two classes, so it outranks
               anything `sx` can emit from a single class: the `bgcolor` below
               was being ignored and the button rendered as white text on the
               white surface, at 1.00:1. Invisible, not merely low contrast.
               `inherit` is outside the scoped selector, which is what that
               scoping exists for — the navbar's Sign out button uses it for
               exactly the same reason. */
            color="inherit"
            sx={{
              px: { xs: 3, sm: 5 }, py: { xs: 1, sm: 1.5 }, fontSize: { xs: '0.9375rem', sm: '1rem' },
              color: '#fff',
              // A translucent dark pill, so the button reads as glass over the
              // hero photo rather than as a pale tile punched out of it.
              bgcolor: 'rgba(20,40,28,0.38)',
              backdropFilter: 'blur(6px)',
              borderColor: 'rgba(255,255,255,0.45)',
              boxShadow: '0 6px 18px 0 rgba(10,25,16,0.4), inset 0 1px 0 0 rgba(255,255,255,0.25)',
              '&:hover': {
                borderColor: '#fff',
                bgcolor: 'rgba(20,40,28,0.52)',
              },
            }}
          >
            Sign In
          </Button>
        </Box>

        {/* Feature strip — pinned to the bottom of the hero on desktop only.
            On mobile the three stacked items were tall enough to cover the
            subtitle and CTA buttons, so there it flows below the hero. */}
        <Box
          sx={{
            position: { xs: 'static', md: 'absolute' },
            bottom: 0,
            left: 0,
            right: 0,
            mt: { xs: 6, md: 0 },
            mx: { xs: -3, md: 0 }, // counter hero's px so the strip is full-bleed
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
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.88)', lineHeight: 1.5 }}>
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
