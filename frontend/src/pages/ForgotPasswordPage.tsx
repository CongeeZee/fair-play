import { useState } from 'react'
import {
  Box, Button, Container, TextField, Typography, Alert,
  Paper, Link as MuiLink,
} from '@mui/material'
import { Link } from 'react-router-dom'
import { forgotPassword } from '../api/auth'
import { getApiErrorMessage } from '../api/errorMessage'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await forgotPassword(email)
      setMessage(data.message)
      setSubmitted(true)
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Something went wrong. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper elevation={2} sx={{ p: 4 }}>
        <Typography variant="h4" align="center" color="primary.main" gutterBottom>
          Forgot Password
        </Typography>
        <Typography variant="body2" align="center" color="text.secondary" sx={{ mb: 3 }}>
          Enter the email on your Fairplay account and we'll send you a reset link.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {submitted ? (
          <Alert severity="success" sx={{ mb: 2 }}>
            {message || 'If an account exists for that email, a password reset link has been sent.'}
          </Alert>
        ) : (
          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
              autoComplete="email"
            />
            <Button type="submit" variant="contained" color="primary" size="large" disabled={loading}>
              {loading ? 'Sending…' : 'Send Reset Link'}
            </Button>
          </Box>
        )}

        <Typography variant="body2" align="center" sx={{ mt: 3 }}>
          Remembered it?{' '}
          <MuiLink component={Link} to="/login">
            Back to sign in
          </MuiLink>
        </Typography>
      </Paper>
    </Container>
  )
}
