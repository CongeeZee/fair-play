import { useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Box,
  Typography, Alert, FormControlLabel, Checkbox, IconButton, InputAdornment,
  CircularProgress,
} from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ShareIcon from '@mui/icons-material/Share'
import CheckIcon from '@mui/icons-material/Check'
import { useMutation } from '@tanstack/react-query'
import { createInvite } from '../api/invites'
import { capture, AnalyticsEvent } from '../analytics'
import type { InviteLink } from '../types'

interface Props {
  open: boolean
  onClose: () => void
}

export default function InviteFriendsDialog({ open, onClose }: Props) {
  const [label, setLabel] = useState('')
  const [useMax, setUseMax] = useState(false)
  const [maxUses, setMaxUses] = useState(20)
  const [useExpiry, setUseExpiry] = useState(false)
  const [expiresInDays, setExpiresInDays] = useState(14)
  const [link, setLink] = useState<InviteLink | null>(null)
  const [copied, setCopied] = useState(false)

  const createMutation = useMutation({
    mutationFn: createInvite,
    onSuccess: (data) => {
      setLink(data)
      capture(AnalyticsEvent.InviteLinkCreated, {
        kind: 'friend',
        label: data.label ?? undefined,
        hasMaxUses: data.maxUses != null,
        hasExpiry: data.expiresAt != null,
      })
    },
  })

  const handleGenerate = () => {
    createMutation.mutate({
      label: label.trim() || undefined,
      maxUses: useMax ? maxUses : undefined,
      expiresInDays: useExpiry ? expiresInDays : undefined,
    })
  }

  const inviteUrl = link
    ? `${window.location.origin}/invite/${link.code}`
    : ''

  const handleCopy = async () => {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore — user can copy manually
    }
  }

  const handleShare = async () => {
    if (!inviteUrl) return
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'Join me on Fairplay',
          text: link?.label
            ? `Join ${link.label} on Fairplay`
            : 'Connect with me on Fairplay',
          url: inviteUrl,
        })
      } catch {
        // user cancelled — no-op
      }
    } else {
      handleCopy()
    }
  }

  const handleClose = () => {
    setLink(null)
    setLabel('')
    setUseMax(false)
    setUseExpiry(false)
    setCopied(false)
    createMutation.reset()
    onClose()
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
      <DialogTitle>Invite friends</DialogTitle>
      <DialogContent>
        {!link ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Generate a link to onboard a society in one go — anyone who joins
              via the same labelled link is auto-connected.
            </Typography>
            <TextField
              label="Label (optional)"
              placeholder="e.g. GOLFSOC"
              value={label}
              onChange={(e) => setLabel(e.target.value.slice(0, 50))}
              size="small"
              fullWidth
              helperText="Shown to invitees. Reuse the same label across links to merge groups."
            />
            <FormControlLabel
              control={<Checkbox checked={useMax} onChange={(e) => setUseMax(e.target.checked)} />}
              label="Limit number of uses"
            />
            {useMax && (
              <TextField
                type="number"
                label="Max uses"
                size="small"
                value={maxUses}
                onChange={(e) => setMaxUses(Math.max(1, parseInt(e.target.value || '1', 10)))}
                slotProps={{ htmlInput: { min: 1, max: 1000 } }}
              />
            )}
            <FormControlLabel
              control={<Checkbox checked={useExpiry} onChange={(e) => setUseExpiry(e.target.checked)} />}
              label="Set an expiry"
            />
            {useExpiry && (
              <TextField
                type="number"
                label="Expires in (days)"
                size="small"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Math.max(1, parseInt(e.target.value || '1', 10)))}
                slotProps={{ htmlInput: { min: 1, max: 365 } }}
              />
            )}
            {createMutation.isError && (
              <Alert severity="error">Could not create invite link. Please try again.</Alert>
            )}
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Alert severity="success">
              Your invite link is ready. Anyone who joins via this link will be auto-connected.
            </Alert>
            <TextField
              value={inviteUrl}
              fullWidth
              size="small"
              slotProps={{
                input: {
                  readOnly: true,
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={handleCopy} edge="end" size="small">
                        {copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Typography variant="caption" color="text.secondary">
              {link.label && <>Label: <b>{link.label}</b> · </>}
              {link.maxUses != null ? `${link.uses}/${link.maxUses} uses` : `${link.uses} uses`}
              {link.expiresAt && ` · expires ${new Date(link.expiresAt).toLocaleDateString()}`}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{link ? 'Done' : 'Cancel'}</Button>
        {!link ? (
          <Button
            variant="contained"
            onClick={handleGenerate}
            disabled={createMutation.isPending}
            startIcon={createMutation.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            Generate link
          </Button>
        ) : (
          <Button variant="contained" startIcon={<ShareIcon />} onClick={handleShare}>
            Share
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
