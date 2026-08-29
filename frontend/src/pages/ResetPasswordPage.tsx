import { useState } from 'react'
import {
  Box, Button, Container, TextField, Typography, Alert,
  IconButton, InputAdornment, Paper, Link as MuiLink,
} from '@mui/material'
import Visibility from '@mui/icons-material/Visibility'
import VisibilityOff from '@mui/icons-material/VisibilityOff'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { resetPassword } from '../api/auth'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const validate = () => {
    if (password.length < 8) return 'Password must be at least 8 characters.'
    if (password !== confirm) return 'Passwords do not match.'
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const v = validate()
    if (v) { setError(v); return }
    setError('')
    setLoading(true)
    try {
      await resetPassword(token, password)
      setSuccess(true)
      setTimeout(() => navigate('/login', { replace: true }), 2000)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg ?? 'Could not reset password. The link may be invalid or expired.')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <Container maxWidth="sm" sx={{ mt: 8 }}>
        <Paper elevation={2} sx={{ p: 4 }}>
          <Typography variant="h4" align="center" color="primary.main" gutterBottom>
            Reset Password
          </Typography>
          <Alert severity="error" sx={{ mb: 2 }}>
            Missing reset token. Please use the link from your email.
          </Alert>
          <Typography variant="body2" align="center" sx={{ mt: 2 }}>
            <MuiLink component={Link} to="/forgot-password">
              Request a new link
            </MuiLink>
          </Typography>
        </Paper>
      </Container>
    )
  }

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper elevation={2} sx={{ p: 4 }}>
        <Typography variant="h4" align="center" color="primary.main" gutterBottom>
          Reset Password
        </Typography>
        <Typography variant="body2" align="center" color="text.secondary" sx={{ mb: 3 }}>
          Choose a new password for your Fairplay account.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {success ? (
          <Alert severity="success" sx={{ mb: 2 }}>
            Password reset successfully. Redirecting to sign in…
          </Alert>
        ) : (
          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="New Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
              helperText="Minimum 8 characters"
              autoComplete="new-password"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((s) => !s)} edge="end">
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              label="Confirm New Password"
              type={showPassword ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              fullWidth
              autoComplete="new-password"
            />
            <Button type="submit" variant="contained" color="primary" size="large" disabled={loading}>
              {loading ? 'Resetting…' : 'Reset Password'}
            </Button>
          </Box>
        )}

        <Typography variant="body2" align="center" sx={{ mt: 3 }}>
          <MuiLink component={Link} to="/login">
            Back to sign in
          </MuiLink>
        </Typography>
      </Paper>
    </Container>
  )
}
