import { useEffect, useState } from 'react'
import { Container, Typography, Paper, CircularProgress, Button } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import { useSearchParams, Link } from 'react-router-dom'
import { verifyEmail } from '../api/auth'
import { useAuth } from '../contexts/AuthContext'

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const { markEmailVerified } = useAuth()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('Missing verification token.')
      return
    }

    verifyEmail(token)
      .then((data) => {
        setStatus('success')
        setMessage(data.message)
        markEmailVerified()
      })
      .catch((err) => {
        setStatus('error')
        setMessage(
          err.response?.data?.error || 'Verification failed. The link may be invalid or expired.',
        )
      })
  }, [token, markEmailVerified])

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper elevation={2} sx={{ p: 5, textAlign: 'center' }}>
        {status === 'loading' && (
          <>
            <CircularProgress color="primary" sx={{ mb: 2 }} />
            <Typography>Verifying your email...</Typography>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircleIcon sx={{ fontSize: 56, color: 'success.main', mb: 2 }} />
            <Typography variant="h5" gutterBottom>
              {message}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Your account is now fully verified.
            </Typography>
            <Button variant="contained" component={Link} to="/courses">
              Start Playing
            </Button>
          </>
        )}

        {status === 'error' && (
          <>
            <ErrorOutlineIcon sx={{ fontSize: 56, color: 'error.main', mb: 2 }} />
            <Typography variant="h5" gutterBottom>
              Verification Failed
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {message}
            </Typography>
            <Button variant="outlined" component={Link} to="/courses">
              Go to App
            </Button>
          </>
        )}
      </Paper>
    </Container>
  )
}
