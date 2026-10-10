import { Box, Typography, Button, Container, Grid, Paper } from '@mui/material'
import DynamicFeedIcon from '@mui/icons-material/DynamicFeed'
import EventAvailableIcon from '@mui/icons-material/EventAvailable'
import InsightsIcon from '@mui/icons-material/Insights'
import LeaderboardIcon from '@mui/icons-material/Leaderboard'
import IosShareIcon from '@mui/icons-material/IosShare'
import { greenGradient } from '../theme'
import GolfCourseIcon from '@mui/icons-material/GolfCourse'
import TrackChangesIcon from '@mui/icons-material/TrackChanges'
import BarChartIcon from '@mui/icons-material/BarChart'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1592919505780-303950717480?auto=format&fit=crop&w=1920&q=80'

const heroPoints = [
  { icon: <TrackChangesIcon sx={{ fontSize: 28, color: '#e0b95c' }} />, title: 'Score every hole', body: 'Fast, one-thumb scoring for 30,000+ real courses — works offline on the course.' },
  { icon: <EmojiEventsIcon sx={{ fontSize: 28, color: '#e0b95c' }} />, title: 'Your handicap, automatic', body: 'A World Handicap System index that updates after every round.' },
  { icon: <BarChartIcon sx={{ fontSize: 28, color: '#e0b95c' }} />, title: 'Know where shots go', body: 'Putts, greens, fairways and strokes gained — and what to work on next.' },
]

const features = [
  { icon: <DynamicFeedIcon />, title: 'A feed for your group', body: 'See your mates’ rounds as they post them. React, comment, and watch rounds live.' },
  { icon: <EmojiEventsIcon />, title: 'Competitions', body: 'Set up a monthly medal or Stableford comp with net scoring done for you.' },
  { icon: <EventAvailableIcon />, title: 'Tee times', body: 'Post a time, invite friends, fill the four-ball — straight into your calendar.' },
  { icon: <InsightsIcon />, title: 'Stats that coach', body: 'Trends, hole breakdowns and plain-English tips from the holes you’ve tracked.' },
  { icon: <LeaderboardIcon />, title: 'Leaderboards', body: 'Friendly rankings by scoring average and handicap, week, month or all time.' },
  { icon: <IosShareIcon />, title: 'Share any scorecard', body: 'A link that opens a clean scorecard for anyone — no account needed to look.' },
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
            fontSize: { xs: '2.75rem', sm: '4rem', md: '5rem' },
            lineHeight: 1.02,
            maxWidth: 820,
            mb: 2.5,
            textShadow: '0 2px 20px rgba(0,0,0,0.4)',
          }}
        >
          Golf’s better with your mates.
        </Typography>

        <Typography
          sx={{
            color: 'rgba(255,255,255,0.88)',
            fontSize: { xs: '1.1rem', md: '1.3rem' },
            maxWidth: 560,
            mb: 5,
            lineHeight: 1.5,
          }}
        >
          Score your rounds, get an automatic handicap, see where you lose shots — and share it all with the people you play with. Free.
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
            Create free account
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
            Sign in
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
              {heroPoints.map((f, i) => (
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

      {/* Everything else */}
      <Container maxWidth="lg" sx={{ py: { xs: 7, md: 11 } }}>
        <Typography variant="overline" sx={{ color: 'var(--c-greenText)', display: 'block', textAlign: 'center' }}>
          More than a scorecard
        </Typography>
        <Typography variant="h3" sx={{ textAlign: 'center', fontSize: { xs: '1.9rem', md: '2.6rem' }, mb: { xs: 4, md: 6 } }}>
          Everything your golf group needs
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 2 }}>
          {features.map((f) => (
            <Paper key={f.title} elevation={0} sx={{ p: 3 }}>
              <Box sx={{ width: 44, height: 44, borderRadius: 3, display: 'grid', placeItems: 'center', bgcolor: 'primary.main', color: 'var(--c-goldOnGreen)', mb: 2 }}>
                {f.icon}
              </Box>
              <Typography variant="h6" sx={{ mb: 0.75 }}>{f.title}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>{f.body}</Typography>
            </Paper>
          ))}
        </Box>
      </Container>

      <Box sx={{ background: greenGradient, py: { xs: 7, md: 9 }, px: 3, textAlign: 'center' }}>
        <Typography variant="h3" sx={{ color: '#fff', fontSize: { xs: '1.8rem', md: '2.4rem' }, mb: 1.5 }}>
          Your next round, sorted.
        </Typography>
        <Typography sx={{ color: 'var(--c-onGreenSoft)', mb: 4, maxWidth: 480, mx: 'auto' }}>
          Sign up in under a minute, pick your course and tee off. Invite your group when you’re ready.
        </Typography>
        <Button variant="contained" color="secondary" size="large" component={Link} to="/register">
          Create free account
        </Button>
      </Box>

      <Box component="footer" sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          © {new Date().getFullYear()} Fairplay · Made for golfers who play with friends
        </Typography>
      </Box>
    </Box>
  )
}
