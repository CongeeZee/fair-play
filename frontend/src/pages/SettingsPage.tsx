import { useState, type ReactNode } from 'react'
import {
  Box, Paper, Typography, List, ListItemButton, ListItemIcon, ListItemText, Switch,
  ToggleButton, ToggleButtonGroup, Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Alert, Snackbar, CircularProgress,
} from '@mui/material'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import StraightenIcon from '@mui/icons-material/Straighten'
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined'
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import DownloadIcon from '@mui/icons-material/Download'
import LogoutIcon from '@mui/icons-material/Logout'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import PageHeader from '../components/PageHeader'
import UserAvatar from '../components/UserAvatar'
import { useAuth } from '../contexts/AuthContext'
import { useUnits } from '../contexts/UnitsContext'
import { useAppearance } from '../contexts/AppearanceContext'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { getAccount, changePassword, deleteAccount } from '../api/auth'
import { updateProfile } from '../api/users'
import { downloadRoundsCsv } from '../api/rounds'
import { getApiErrorMessage } from '../api/errorMessage'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block', px: 0.5, mb: 0.75 }}>{title}</Typography>
      <Paper elevation={0} sx={{ overflow: 'hidden' }}>
        <List disablePadding sx={{ '& > * + *': { borderTop: '1px solid var(--c-borderC)' } }}>{children}</List>
      </Paper>
    </Box>
  )
}

function Row({ icon, primary, secondary, action, onClick, danger }: {
  icon: ReactNode
  primary: string
  secondary?: string
  action?: ReactNode
  onClick?: () => void
  danger?: boolean
}) {
  return (
    <ListItemButton
      onClick={onClick}
      disableRipple={!onClick}
      sx={{ borderRadius: 0, py: 1.5, cursor: onClick ? 'pointer' : 'default', color: danger ? 'error.main' : undefined, '&:hover': onClick ? undefined : { bgcolor: 'transparent' } }}
    >
      <ListItemIcon sx={{ minWidth: 40, color: danger ? 'error.main' : 'text.secondary' }}>{icon}</ListItemIcon>
      <ListItemText primary={primary} secondary={secondary} primaryTypographyProps={{ fontWeight: 600 }} />
      {action ?? (onClick ? <ChevronRightIcon sx={{ color: 'text.secondary' }} /> : null)}
    </ListItemButton>
  )
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, logout, updateUser } = useAuth()
  const { unit, setUnit } = useUnits()
  const { appearance, setAppearance } = useAppearance()
  const push = usePushNotifications()
  const [toast, setToast] = useState('')

  const { data: account } = useQuery({ queryKey: ['account'], queryFn: getAccount })

  // ── Name ──
  const [nameOpen, setNameOpen] = useState(false)
  const [name, setName] = useState(user?.name ?? '')
  const nameMut = useMutation({
    mutationFn: () => updateProfile({ name: name.trim() }),
    onSuccess: (data) => {
      updateUser({ name: data.name })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      setNameOpen(false)
      setToast('Name updated')
    },
  })

  // ── Password ──
  const [pwOpen, setPwOpen] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const pwMut = useMutation({
    mutationFn: () => changePassword(newPw, account?.hasPassword ? currentPw : undefined),
    onSuccess: () => {
      setPwOpen(false)
      setCurrentPw('')
      setNewPw('')
      queryClient.invalidateQueries({ queryKey: ['account'] })
      setToast('Password updated — other devices have been signed out')
    },
  })

  // ── Export ──
  const exportMut = useMutation({
    mutationFn: downloadRoundsCsv,
    onError: () => setToast("Couldn't export your rounds. Try again."),
  })

  // ── Delete ──
  const [delOpen, setDelOpen] = useState(false)
  const [delConfirm, setDelConfirm] = useState('')
  const [delPw, setDelPw] = useState('')
  const delMut = useMutation({
    mutationFn: () => deleteAccount(account?.hasPassword ? delPw : undefined),
    onSuccess: () => {
      queryClient.clear()
      logout()
      navigate('/', { replace: true })
    },
  })

  if (!user) return null

  return (
    <Box sx={{ maxWidth: 640, mx: 'auto', px: 2, pb: 4 }}>
      <PageHeader title="Settings" />

      <Paper elevation={0} sx={{ p: 2, mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
        <UserAvatar userId={Number(user.id)} name={user.name} size={56} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="h6" noWrap>{user.name}</Typography>
          <Typography variant="body2" color="text.secondary" noWrap>{account?.email ?? user.email}</Typography>
        </Box>
        <Button variant="outlined" size="small" onClick={() => navigate('/profile/me')}>View profile</Button>
      </Paper>

      <Section title="Profile">
        <Row icon={<PersonOutlineIcon />} primary="Display name" secondary={user.name} onClick={() => { setName(user.name); setNameOpen(true) }} />
      </Section>

      <Section title="Preferences">
        <Row
          icon={<StraightenIcon />}
          primary="Distances"
          action={
            <ToggleButtonGroup exclusive size="small" value={unit} onChange={(_, v) => v && setUnit(v)} aria-label="Distance units">
              <ToggleButton value="yards">Yards</ToggleButton>
              <ToggleButton value="metres">Metres</ToggleButton>
            </ToggleButtonGroup>
          }
        />
        <Row
          icon={<DarkModeOutlinedIcon />}
          primary="Appearance"
          action={
            <ToggleButtonGroup exclusive size="small" value={appearance} onChange={(_, v) => v && setAppearance(v)} aria-label="Appearance">
              <ToggleButton value="light">Light</ToggleButton>
              <ToggleButton value="dark">Dark</ToggleButton>
            </ToggleButtonGroup>
          }
        />
        <Row
          icon={<NotificationsNoneIcon />}
          primary="Push notifications"
          secondary={push.isSupported ? 'Reactions, comments, invites and friends’ rounds' : 'Not supported in this browser — you’ll still see them in the app'}
          action={
            <Switch
              checked={push.isSubscribed}
              disabled={!push.isSupported}
              onChange={() => (push.isSubscribed ? push.unsubscribeFromNotifications() : push.subscribeToNotifications())}
              inputProps={{ 'aria-label': 'Push notifications' }}
            />
          }
        />
      </Section>

      <Section title="Account">
        <Row
          icon={<LockOutlinedIcon />}
          primary={account?.hasPassword === false ? 'Set a password' : 'Change password'}
          secondary={account?.googleLinked ? 'You can also sign in with Google' : undefined}
          onClick={() => setPwOpen(true)}
        />
        <Row
          icon={exportMut.isPending ? <CircularProgress size={20} /> : <DownloadIcon />}
          primary="Export my rounds"
          secondary="Download every round as a spreadsheet (CSV)"
          onClick={() => exportMut.mutate()}
        />
        <Row icon={<LogoutIcon />} primary="Sign out" onClick={() => { logout(); navigate('/login') }} />
      </Section>

      <Section title="Danger zone">
        <Row icon={<DeleteOutlineIcon />} primary="Delete account" secondary="Permanently remove your account, rounds and comments" onClick={() => setDelOpen(true)} danger />
      </Section>

      {/* Name */}
      <Dialog open={nameOpen} onClose={() => setNameOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Display name</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth margin="dense" label="Name" value={name}
            onChange={(e) => setName(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 50 } }}
            helperText="Shown to your friends on the feed and leaderboards"
          />
          {nameMut.error && <Alert severity="error" sx={{ mt: 1 }}>{getApiErrorMessage(nameMut.error, "Couldn't save your name")}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNameOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => nameMut.mutate()} disabled={!name.trim() || nameMut.isPending}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Password */}
      <Dialog open={pwOpen} onClose={() => setPwOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{account?.hasPassword === false ? 'Set a password' : 'Change password'}</DialogTitle>
        <DialogContent>
          {account?.hasPassword !== false && (
            <TextField fullWidth margin="dense" type="password" label="Current password" autoComplete="current-password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
          )}
          <TextField
            fullWidth margin="dense" type="password" label="New password" autoComplete="new-password"
            value={newPw} onChange={(e) => setNewPw(e.target.value)}
            helperText="At least 8 characters"
            error={newPw.length > 0 && newPw.length < 8}
          />
          {pwMut.error && <Alert severity="error" sx={{ mt: 1 }}>{getApiErrorMessage(pwMut.error, "Couldn't change your password")}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPwOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => pwMut.mutate()}
            disabled={newPw.length < 8 || (account?.hasPassword !== false && !currentPw) || pwMut.isPending}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete */}
      <Dialog open={delOpen} onClose={() => !delMut.isPending && setDelOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Delete your account?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            This permanently deletes your profile, every round you've logged, your comments, reactions,
            competitions you created and tee times you organised. It can't be undone.
            Consider exporting your rounds first.
          </Typography>
          {account?.hasPassword && (
            <TextField fullWidth margin="dense" type="password" label="Password" autoComplete="current-password" value={delPw} onChange={(e) => setDelPw(e.target.value)} />
          )}
          <TextField
            fullWidth margin="dense" label='Type DELETE to confirm' value={delConfirm}
            onChange={(e) => setDelConfirm(e.target.value)}
          />
          {delMut.error && <Alert severity="error" sx={{ mt: 1 }}>{getApiErrorMessage(delMut.error, "Couldn't delete your account")}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelOpen(false)} disabled={delMut.isPending}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => delMut.mutate()}
            disabled={delConfirm !== 'DELETE' || (!!account?.hasPassword && !delPw) || delMut.isPending}
          >
            {delMut.isPending ? 'Deleting…' : 'Delete forever'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast('')} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} sx={{ mb: { xs: '76px', md: 0 } }} />
    </Box>
  )
}
