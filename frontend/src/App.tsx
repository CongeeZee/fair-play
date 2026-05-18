import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { Box, Toolbar } from '@mui/material'

import theme from './theme'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '385243330154-m8dse9gevr7bvkm0kpk21grgu5cq14lk.apps.googleusercontent.com'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'
import BottomNav from './components/BottomNav'
import VerifyEmailBanner from './components/VerifyEmailBanner'
import { useAuth } from './contexts/AuthContext'

import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import CoursesPage from './pages/CoursesPage'
import RoundPage from './pages/RoundPage'
import HistoryPage from './pages/HistoryPage'
import StatsPage from './pages/StatsPage'
import CourseStatsPage from './pages/CourseStatsPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import SharedScorecardPage from './pages/SharedScorecardPage'
import RateLimitSnackbar from './components/RateLimitSnackbar'

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
      pb: showBottomNav ? { xs: '60px', md: 0 } : 0,
    }}>
      <Navbar />
      {/* Spacer so fixed navbar doesn't overlap content — not needed on home
          because the hero intentionally sits behind the transparent navbar */}
      {!isHome && <Toolbar />}
      {!isHome && <VerifyEmailBanner />}
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/scorecard/:shareId" element={<SharedScorecardPage />} />
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
          path="/stats"
          element={<ProtectedRoute><StatsPage /></ProtectedRoute>}
        />
        <Route
          path="/stats/courses/:courseId"
          element={<ProtectedRoute><CourseStatsPage /></ProtectedRoute>}
        />
      </Routes>
      {showBottomNav && <BottomNav />}
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
