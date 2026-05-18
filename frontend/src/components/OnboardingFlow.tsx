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
    else handleComplete()
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
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: isMobile ? '100vh' : 480 }}>
        {/* Content area */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', px: 4, py: 5, textAlign: 'center' }}>
          {step === 0 && (
            <>
              <GolfCourseIcon sx={{ fontSize: 64, color: '#c9a84c', mb: 3 }} />
              <Typography variant="h4" sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, color: '#1a3a2a', mb: 1.5 }}>
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
                width: 80, height: 80, borderRadius: '50%', bgcolor: 'rgba(201,168,76,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3,
              }}>
                <SearchIcon sx={{ fontSize: 40, color: '#c9a84c' }} />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#1a3a2a', mb: 1.5 }}>
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
                width: 80, height: 80, borderRadius: '50%', bgcolor: 'rgba(201,168,76,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3,
              }}>
                <SportsGolfIcon sx={{ fontSize: 40, color: '#c9a84c' }} />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#1a3a2a', mb: 1.5 }}>
                Score your round
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 360, lineHeight: 1.7, mb: 2 }}>
                Tap to score each hole as you play. We'll track your putts, fairways, and more.
              </Typography>
              {/* Visual mock of score chips */}
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mb: 1 }}>
                {[
                  { label: '3', color: '#2d5e42', desc: 'Birdie' },
                  { label: '4', color: '#f5f0e8', desc: 'Par', textColor: '#1a3a2a', border: true },
                  { label: '5', color: '#c62828', desc: 'Bogey' },
                  { label: '6', color: '#b71c1c', desc: 'Double' },
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
                width: 80, height: 80, borderRadius: '50%', bgcolor: 'rgba(201,168,76,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3,
              }}>
                <PeopleIcon sx={{ fontSize: 40, color: '#c9a84c' }} />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#1a3a2a', mb: 1.5 }}>
                Add friends
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 360, lineHeight: 1.7, mb: 3 }}>
                Find your mates and see how you stack up. Compare handicaps, see who's improving, and check out each other's rounds.
              </Typography>
              <Button
                variant="outlined"
                onClick={() => handleNavigate('/friends')}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                Add Friends
              </Button>
            </>
          )}
        </Box>

        {/* Footer with stepper and buttons */}
        <Box sx={{ px: 3, pb: 3 }}>
          <MobileStepper
            variant="dots"
            steps={STEPS.length}
            position="static"
            activeStep={step}
            sx={{ bgcolor: 'transparent', justifyContent: 'center', mb: 2 }}
            backButton={<div />}
            nextButton={<div />}
          />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Button onClick={handleSkip} sx={{ textTransform: 'none', color: 'text.secondary' }}>
              Skip
            </Button>
            <Button variant="contained" onClick={handleNext} sx={{ textTransform: 'none', px: 4 }}>
              {step === STEPS.length - 1 ? 'Done' : 'Next'}
            </Button>
          </Box>
        </Box>
      </Box>
    </Dialog>
  )
}
