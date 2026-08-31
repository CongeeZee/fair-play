import { useEffect, useState } from 'react'
import {
  Container, Paper, Typography, Button, Alert, CircularProgress, Box, Chip,
  Link as MuiLink,
} from '@mui/material'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { previewInvite, acceptInvite } from '../api/invites'
import { useAuth } from '../contexts/AuthContext'
import type { InvitePreview } from '../types'
import { getApiErrorMessage } from '../api/errorMessage'

const PENDING_INVITE_KEY = 'pendingInviteCode'

export default function InvitePage() {
  const { code = '' } = useParams<{ code: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    previewInvite(code)
      .then((p) => { if (!cancelled) setPreview(p) })
      .catch((err) => {
        if (cancelled) return
        const msg = err?.response?.status === 404
          ? 'This invite link does not exist or has been revoked.'
          : 'Could not load this invite.'
        setPreviewError(msg)
      })
    return () => { cancelled = true }
  }, [code])

  const handleAcceptOrAuth = async () => {
    if (!user) {
      // Stash the code so register/login can redeem it post-auth.
      localStorage.setItem(PENDING_INVITE_KEY, code)
      navigate('/register', { state: { from: `/invite/${code}` } })
      return
    }
    setAccepting(true)
    setAcceptError(null)
    try {
      const result = await acceptInvite(code)
      localStorage.removeItem(PENDING_INVITE_KEY)
      navigate('/feed', {
        state: result.alreadyAccepted
          ? { inviteToast: 'You already joined via this link.' }
          : { inviteToast: `Connected with ${result.friendsAdded} new friend${result.friendsAdded === 1 ? '' : 's'}.` },
      })
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      setAcceptError(getApiErrorMessage(err, status === 410
        ? 'This invite is no longer valid.'
        : 'Could not accept this invite. Please try again.'))
    } finally {
      setAccepting(false)
    }
  }

  if (previewError) {
    return (
      <Container maxWidth="sm" sx={{ mt: 8 }}>
        <Paper elevation={2} sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h5" gutterBottom>Invite unavailable</Typography>
          <Alert severity="warning" sx={{ mb: 3 }}>{previewError}</Alert>
          <Button component={Link} to="/" variant="contained">Back to home</Button>
        </Paper>
      </Container>
    )
  }

  if (!preview) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper elevation={2} sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="overline" color="text.secondary">
          You've been invited to Fairplay
        </Typography>
        <Typography variant="h4" color="primary.main" sx={{ mt: 1, mb: 2 }}>
          {preview.inviter.name} wants to play
        </Typography>
        {preview.label && (
          <Chip label={preview.label} sx={{ mb: 2 }} color="primary" variant="outlined" />
        )}
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          {user
            ? `Accept to instantly connect with ${preview.inviter.name}${preview.label ? ` and the rest of ${preview.label}` : ''}.`
            : `Sign up to instantly connect with ${preview.inviter.name}${preview.label ? ` and the rest of ${preview.label}` : ''} — no searching required.`}
        </Typography>

        {!preview.valid && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {preview.expired
              ? 'This invite link has expired.'
              : 'This invite link has reached its usage limit.'}
          </Alert>
        )}

        {acceptError && <Alert severity="error" sx={{ mb: 2 }}>{acceptError}</Alert>}

        <Button
          variant="contained"
          color="primary"
          size="large"
          fullWidth
          disabled={!preview.valid || accepting}
          onClick={handleAcceptOrAuth}
        >
          {accepting
            ? 'Connecting…'
            : user
              ? `Accept invite`
              : `Sign up & connect`}
        </Button>

        {!user && (
          <Typography variant="body2" sx={{ mt: 2 }}>
            Already have an account?{' '}
            <MuiLink
              component="button"
              type="button"
              onClick={() => {
                localStorage.setItem(PENDING_INVITE_KEY, code)
                navigate('/login', { state: { from: `/invite/${code}` } })
              }}
            >
              Sign in
            </MuiLink>
          </Typography>
        )}
      </Paper>
    </Container>
  )
}

export { PENDING_INVITE_KEY }
