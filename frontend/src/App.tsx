import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Box } from '@mui/material'

import theme from './theme'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'

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
      staleTime: 30_000,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <AuthProvider>
            <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
              <Navbar />
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
            </Box>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
