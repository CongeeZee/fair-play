import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Box, Toolbar } from '@mui/material'

import theme from './theme'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'
import BottomNav from './components/BottomNav'
import { useAuth } from './contexts/AuthContext'

import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import CoursesPage from './pages/CoursesPage'
import RoundPage from './pages/RoundPage'
import HistoryPage from './pages/HistoryPage'
import StatsPage from './pages/StatsPage'

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
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
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
      </Routes>
      {showBottomNav && <BottomNav />}
    </Box>
  )
}

export default function App() {
  return (
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
  )
}
