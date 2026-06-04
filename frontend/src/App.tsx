import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { Box, Toolbar, CircularProgress } from '@mui/material'

import theme from './theme'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '385243330154-m8dse9gevr7bvkm0kpk21grgu5cq14lk.apps.googleusercontent.com'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'
import BottomNav from './components/BottomNav'
import VerifyEmailBanner from './components/VerifyEmailBanner'
import { useAuth } from './contexts/AuthContext'

// HomePage is the landing route — keep it eager so first paint isn't gated
// behind an extra chunk fetch. Every other page is code-split and only
// downloaded when its route is first visited.
import HomePage from './pages/HomePage'
const LoginPage = lazy(() => import('./pages/LoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const CoursesPage = lazy(() => import('./pages/CoursesPage'))
const RoundPage = lazy(() => import('./pages/RoundPage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const StatsPage = lazy(() => import('./pages/StatsPage'))
const CourseStatsPage = lazy(() => import('./pages/CourseStatsPage'))
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'))
const SharedScorecardPage = lazy(() => import('./pages/SharedScorecardPage'))
const FriendsPage = lazy(() => import('./pages/FriendsPage'))
const FeedPage = lazy(() => import('./pages/FeedPage'))
const CompetitionsPage = lazy(() => import('./pages/CompetitionsPage'))
const TeeTimesPage = lazy(() => import('./pages/TeeTimesPage'))
const PlayPage = lazy(() => import('./pages/PlayPage'))
const LiveScorecardPage = lazy(() => import('./pages/LiveScorecardPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const CourseReviewsPage = lazy(() => import('./pages/CourseReviewsPage'))
import RateLimitSnackbar from './components/RateLimitSnackbar'
import OnboardingFlow from './components/OnboardingFlow'

function PageLoader() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
      <CircularProgress />
    </Box>
  )
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60_000,  // 5 minutes — most data is stable
      gcTime: 10 * 60_000,    // keep unused cache for 10 minutes
    },
  },
})

function Layout() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const isHome = pathname === '/'
  // Show bottom nav on authenticated pages (not home/login/register)
  const showBottomNav = user && !['/login', '/register', '/'].includes(pathname)

  return (
    <Box sx={{
      minHeight: '100vh',
      bgcolor: 'background.default',
      // On mobile, add bottom padding so fixed BottomNav doesn't overlap content
      pb: showBottomNav ? { xs: 'calc(60px + env(safe-area-inset-bottom, 0px))', md: 0 } : 0,
    }}>
      <Navbar />
      {/* Spacer so fixed navbar doesn't overlap content — not needed on home
          because the hero intentionally sits behind the transparent navbar */}
      {!isHome && <Toolbar />}
      {!isHome && <VerifyEmailBanner />}
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/scorecard/:shareId" element={<SharedScorecardPage />} />
        <Route path="/courses/:courseId/reviews" element={<CourseReviewsPage />} />
        <Route
          path="/feed"
          element={<ProtectedRoute><FeedPage /></ProtectedRoute>}
        />
        <Route
          path="/courses"
          element={<ProtectedRoute><CoursesPage /></ProtectedRoute>}
        />
        <Route
          path="/rounds/:id"
          element={<ProtectedRoute><RoundPage /></ProtectedRoute>}
        />
        <Route
          path="/history"
          element={<ProtectedRoute><HistoryPage /></ProtectedRoute>}
        />
        <Route
          path="/friends"
          element={<ProtectedRoute><FriendsPage /></ProtectedRoute>}
        />
        <Route
          path="/play"
          element={<ProtectedRoute><PlayPage /></ProtectedRoute>}
        />
        <Route
          path="/profile/:userId"
          element={<ProtectedRoute><ProfilePage /></ProtectedRoute>}
        />
        <Route
          path="/live/:roundId"
          element={<ProtectedRoute><LiveScorecardPage /></ProtectedRoute>}
        />
        <Route
          path="/teetimes"
          element={<ProtectedRoute><TeeTimesPage /></ProtectedRoute>}
        />
        <Route
          path="/teetimes/:id"
          element={<ProtectedRoute><TeeTimesPage /></ProtectedRoute>}
        />
        <Route
          path="/competitions"
          element={<ProtectedRoute><CompetitionsPage /></ProtectedRoute>}
        />
        <Route
          path="/competitions/:id"
          element={<ProtectedRoute><CompetitionsPage /></ProtectedRoute>}
        />
        <Route
          path="/stats"
          element={<ProtectedRoute><StatsPage /></ProtectedRoute>}
        />
        <Route
          path="/stats/courses/:courseId"
          element={<ProtectedRoute><CourseStatsPage /></ProtectedRoute>}
        />
      </Routes>
      </Suspense>
      {showBottomNav && <BottomNav />}
      <OnboardingFlow />
      <RateLimitSnackbar />
    </Box>
  )
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <BrowserRouter>
            <AuthProvider>
              <Layout />
            </AuthProvider>
          </BrowserRouter>
        </ThemeProvider>
      </QueryClientProvider>
    </GoogleOAuthProvider>
  )
}
