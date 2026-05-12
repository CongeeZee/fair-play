import { useState } from 'react'
import { Alert, Button, Collapse } from '@mui/material'
import { resendVerification } from '../api/auth'
import { useAuth } from '../contexts/AuthContext'

export default function VerifyEmailBanner() {
  const { user } = useAuth()
  const [dismissed, setDismissed] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  if (!user || user.emailVerified || dismissed) return null

  const handleResend = async () => {
    setSending(true)
    setError('')
    try {
      await resendVerification()
      setSent(true)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg || 'Failed to send. Try again later.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Collapse in>
      <Alert
        severity="warning"
        onClose={() => setDismissed(true)}
        action={
          !sent ? (
            <Button
              color="inherit"
              size="small"
              onClick={handleResend}
              disabled={sending}
            >
              {sending ? 'Sending...' : 'Resend'}
            </Button>
          ) : undefined
        }
        sx={{ borderRadius: 0 }}
      >
        {sent
          ? 'Verification email sent! Check your inbox.'
          : error
            ? error
            : 'Please verify your email address. Check your inbox for a verification link.'}
      </Alert>
    </Collapse>
  )
}
