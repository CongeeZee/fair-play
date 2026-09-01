import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { Box, Toolbar, CircularProgress } from '@mui/material'

import { AppearanceProvider } from './contexts/AppearanceContext'
import { UnitsProvider } from './contexts/UnitsContext'
import { initAnalytics } from './analytics'

initAnalytics()

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

/* The five bottom-nav destinations are pulled out as named importers so the
   idle prefetch below can warm exactly the chunks a signed-in user is most
   likely to open next. `import()` is memoised by the browser, so calling one
   here and again through `lazy()` costs a single fetch. */
const importFeed = () => import('./pages/FeedPage')
const importPlay = () => import('./pages/PlayPage')
const importCompetitions = () => import('./pages/CompetitionsPage')
const importStats = () => import('./pages/StatsPage')
const importFriends = () => import('./pages/FriendsPage')

const LoginPage = lazy(() => import('./pages/LoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const CoursesPage = lazy(() => import('./pages/CoursesPage'))
const RoundPage = lazy(() => import('./pages/RoundPage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const StatsPage = lazy(importStats)
const CourseStatsPage = lazy(() => import('./pages/CourseStatsPage'))
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const SharedScorecardPage = lazy(() => import('./pages/SharedScorecardPage'))
const FriendsPage = lazy(importFriends)
const FeedPage = lazy(importFeed)
const CompetitionsPage = lazy(importCompetitions)
const TeeTimesPage = lazy(() => import('./pages/TeeTimesPage'))
const PlayPage = lazy(importPlay)
const LiveScorecardPage = lazy(() => import('./pages/LiveScorecardPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const CourseReviewsPage = lazy(() => import('./pages/CourseReviewsPage'))
const InvitePage = lazy(() => import('./pages/InvitePage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
import RouteErrorBoundary from './components/RouteErrorBoundary'
import RateLimitSnackbar from './components/RateLimitSnackbar'
import OnboardingFlow from './components/OnboardingFlow'
import InstallPrompt from './components/InstallPrompt'

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

/**
 * Warm the chunks behind the bottom nav once the current page has settled.
 *
 * Route-level code splitting keeps the first load small, but it moves the cost
 * to the first tap: pressing "Comps" starts a fresh chunk download and shows a
 * spinner until it lands. Fetching those five during idle time turns every
 * subsequent navigation into a cache hit.
 *
 * Two guards, because this is spending someone else's data:
 *   - only for a signed-in user, since those routes are all behind auth;
 *   - not on Save-Data or a 2g connection, where a speculative 130 kB is a
 *     worse trade than a spinner.
 * `requestIdleCallback` keeps it behind anything the current page still wants
 * to do, with a timeout so it still happens on a page that never goes idle.
 */
function usePrefetchNavRoutes(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    const conn = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string }
    }).connection
    if (conn?.saveData) return
    if (conn?.effectiveType && /(^|-)2g$/.test(conn.effectiveType)) return

    const run = () => {
      // Failures are ignored on purpose: this is speculative, and a rejected
      // prefetch must not surface anywhere. The real navigation will retry
      // and report properly through the route boundary.
      for (const load of [importFeed, importPlay, importCompetitions, importStats, importFriends]) {
        void load().catch(() => {})
      }
    }

    const ric = (window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      cancelIdleCallback?: (h: number) => void
    })

    if (ric.requestIdleCallback) {
      const handle = ric.requestIdleCallback(run, { timeout: 3000 })
      return () => ric.cancelIdleCallback?.(handle)
    }
    const t = window.setTimeout(run, 2000)
    return () => window.clearTimeout(t)
  }, [enabled])
}

function Layout() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const isHome = pathname === '/'
  usePrefetchNavRoutes(!!user)
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
      {/* Keyed on the path so navigating away from a page that threw clears
          the error instead of stranding the user on the fallback. */}
      <RouteErrorBoundary resetKey={pathname}>
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/scorecard/:shareId" element={<SharedScorecardPage />} />
        <Route path="/invite/:code" element={<InvitePage />} />
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
        {/* Without this, an unknown URL matched no route and rendered the
            chrome around an empty page. */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense>
      </RouteErrorBoundary>
      {showBottomNav && <BottomNav />}
      <OnboardingFlow />
      <RateLimitSnackbar />
      <InstallPrompt />
    </Box>
  )
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <QueryClientProvider client={queryClient}>
        {/* AppearanceProvider supplies the theme and CssBaseline, and sits
            inside the router because course density is derived from the route.
            Everything visual therefore mounts below BrowserRouter now. */}
        <BrowserRouter>
          <AppearanceProvider>
            <UnitsProvider>
              <AuthProvider>
                <Layout />
              </AuthProvider>
            </UnitsProvider>
          </AppearanceProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </GoogleOAuthProvider>
  )
}
