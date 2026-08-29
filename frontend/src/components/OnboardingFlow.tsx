import { useState } from 'react'
import {
  Dialog, Box, Typography, Button, MobileStepper, useMediaQuery, useTheme,
} from '@mui/material'
import GolfCourseIcon from '@mui/icons-material/GolfCourse'
import SearchIcon from '@mui/icons-material/Search'
import SportsGolfIcon from '@mui/icons-material/SportsGolf'
import PeopleIcon from '@mui/icons-material/People'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { completeOnboarding } from '../api/auth'

const STEPS = [
  { key: 'welcome' },
  { key: 'courses' },
  { key: 'scoring' },
  { key: 'friends' },
] as const

export default function OnboardingFlow() {
  const { user, markOnboardingComplete } = useAuth()
  const navigate = useNavigate()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const [step, setStep] = useState(0)

  if (!user || user.hasCompletedOnboarding) return null

  const handleComplete = () => {
    completeOnboarding().catch(() => {})
    markOnboardingComplete()
  }

  const handleSkip = () => handleComplete()

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep(step + 1)
    // On the final step, drop the user straight into course search so the
    // first action is teeing up their first round — not a blank page.
    else handleNavigate('/courses')
  }

  const handleNavigate = (path: string) => {
    handleComplete()
    navigate(path)
  }

  return (
    <Dialog
      open
      fullScreen={isMobile}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: isMobile ? 0 : 3,
          overflow: 'hidden',
        },
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: isMobile ? '100dvh' : 480 }}>
        {/* Content area */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: { xs: 'flex-start', sm: 'center' }, px: 3, pt: { xs: 8, sm: 4 }, pb: 4, textAlign: 'center', overflow: 'auto' }}>
          {step === 0 && (
            <>
              <GolfCourseIcon sx={{ fontSize: 64, color: '#e0b95c', mb: 3 }} />
              <Typography variant="h4" sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, color: '#2f6b4c', mb: 1.5 }}>
                Welcome to Fairplay{user.name ? `, ${user.name.split(' ')[0]}` : ''}!
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 360, lineHeight: 1.7 }}>
                Track your rounds, see your stats improve, and compete with friends. Let's get you started.
              </Typography>
            </>
          )}

          {step === 1 && (
            <>
              <Box sx={{
                width: 80, height: 80, borderRadius: '50%', bgcolor: 'rgba(224,185,92,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3,
              }}>
                <SearchIcon sx={{ fontSize: 40, color: '#e0b95c' }} />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#2f6b4c', mb: 1.5 }}>
                Find a course
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 360, lineHeight: 1.7, mb: 3 }}>
                Search for any course in Australia (or worldwide) and pick your tees. We have thousands of courses with full hole data.
              </Typography>
              <Button
                variant="outlined"
                onClick={() => handleNavigate('/courses')}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                Try it now
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <Box sx={{
                width: 80, height: 80, borderRadius: '50%', bgcolor: 'rgba(224,185,92,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3,
              }}>
                <SportsGolfIcon sx={{ fontSize: 40, color: '#e0b95c' }} />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#2f6b4c', mb: 1.5 }}>
                Score your round
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 360, lineHeight: 1.7, mb: 2 }}>
                Tap to score each hole as you play. We'll track your putts, fairways, and more.
              </Typography>
              {/* Visual mock of score chips */}
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mb: 1 }}>
                {[
                  { label: '3', color: '#4a8a68', desc: 'Birdie' },
                  { label: '4', color: '#e9e1d3', desc: 'Par', textColor: '#2f6b4c', border: true },
                  { label: '5', color: '#b0574c', desc: 'Bogey' },
                  { label: '6', color: '#9a4a41', desc: 'Double' },
                ].map((c) => (
                  <Box key={c.label} sx={{ textAlign: 'center' }}>
                    <Box sx={{
                      width: 44, height: 44, borderRadius: '50%', bgcolor: c.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: c.border ? '2px solid #ccc' : 'none',
                    }}>
                      <Typography sx={{ fontWeight: 800, color: c.textColor ?? '#fff', fontSize: '1.1rem' }}>
                        {c.label}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                      {c.desc}
                    </Typography>
                  </Box>
                ))}
              </Box>
              <Typography variant="caption" color="text.secondary">
                Par 4 example — tap the number that matches your score
              </Typography>
            </>
          )}

          {step === 3 && (
            <>
              <Box sx={{
                width: 80, height: 80, borderRadius: '50%', bgcolor: 'rgba(224,185,92,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3,
              }}>
                <PeopleIcon sx={{ fontSize: 40, color: '#e0b95c' }} />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#2f6b4c', mb: 1.5 }}>
                Bring your mates
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 360, lineHeight: 1.7, mb: 3 }}>
                Share one invite link with your golf society — everyone who joins gets auto-connected so the leaderboards and feed light up from day one.
              </Typography>
              <Button
                variant="outlined"
                onClick={() => handleNavigate('/friends')}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                Invite my mates
              </Button>
            </>
          )}
        </Box>

        {/* Footer with stepper and buttons */}
        <Box sx={{ px: 3, pb: `calc(16px + env(safe-area-inset-bottom, 0px))`, flexShrink: 0 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Button onClick={handleSkip} sx={{ textTransform: 'none', color: 'text.secondary', fontSize: '0.95rem' }}>
              Skip
            </Button>
            <Button variant="contained" onClick={handleNext} sx={{ textTransform: 'none', px: 4, py: 1.2, fontSize: '0.95rem' }}>
              {step === STEPS.length - 1 ? 'Get Started' : 'Next'}
            </Button>
          </Box>
          <MobileStepper
            variant="dots"
            steps={STEPS.length}
            position="static"
            activeStep={step}
            sx={{ bgcolor: 'transparent', justifyContent: 'center' }}
            backButton={<div />}
            nextButton={<div />}
          />
        </Box>
      </Box>
    </Dialog>
  )
}
