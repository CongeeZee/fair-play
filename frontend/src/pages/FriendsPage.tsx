import { useState, useCallback } from 'react'
import {
  Box, Typography, Tabs, Tab, Badge, List, ListItem, ListItemText,
  IconButton, Button, TextField, InputAdornment, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert, Chip,
} from '@mui/material'
import PersonRemoveIcon from '@mui/icons-material/PersonRemove'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import SearchIcon from '@mui/icons-material/Search'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getFriends, getFriendRequests, searchUsers,
  sendFriendRequest, acceptFriendRequest, declineFriendRequest, removeFriend,
} from '../api/friends'
import PageHeader from '../components/PageHeader'

function FriendsTab() {
  const queryClient = useQueryClient()
  const { data: friends, isLoading } = useQuery({ queryKey: ['friends'], queryFn: getFriends })
  const [removeTarget, setRemoveTarget] = useState<{ friendshipId: string; name: string } | null>(null)

  const removeMutation = useMutation({
    mutationFn: removeFriend,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      setRemoveTarget(null)
    },
  })

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box>

  if (!friends?.length) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography color="text.secondary">No friends yet. Use the Find Friends tab to connect with others.</Typography>
      </Box>
    )
  }

  return (
    <>
      <List disablePadding>
        {friends.map((f) => (
          <ListItem
            key={f.friendshipId}
            divider
            secondaryAction={
              <IconButton edge="end" onClick={() => setRemoveTarget({ friendshipId: f.friendshipId, name: f.name })} size="small">
                <PersonRemoveIcon fontSize="small" />
              </IconButton>
            }
          >
            <ListItemText
              primary={f.name}
              secondary={f.handicapIndex != null ? `Handicap: ${f.handicapIndex.toFixed(1)}` : 'No handicap'}
            />
          </ListItem>
        ))}
      </List>

      <Dialog open={!!removeTarget} onClose={() => setRemoveTarget(null)}>
        <DialogTitle>Remove Friend</DialogTitle>
        <DialogContent>
          <Typography>Remove {removeTarget?.name} from your friends?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveTarget(null)}>Cancel</Button>
          <Button
            color="error"
            onClick={() => removeTarget && removeMutation.mutate(removeTarget.friendshipId)}
            disabled={removeMutation.isPending}
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

function RequestsTab() {
  const queryClient = useQueryClient()
  const { data: requests, isLoading } = useQuery({ queryKey: ['friend-requests'], queryFn: getFriendRequests })

  const acceptMutation = useMutation({
    mutationFn: acceptFriendRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] })
      queryClient.invalidateQueries({ queryKey: ['friends'] })
    },
  })

  const declineMutation = useMutation({
    mutationFn: declineFriendRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] })
    },
  })

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box>

  if (!requests?.length) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography color="text.secondary">No pending friend requests.</Typography>
      </Box>
    )
  }

  return (
    <List disablePadding>
      {requests.map((r) => (
        <ListItem
          key={r.friendshipId}
          divider
          secondaryAction={
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <IconButton
                color="primary"
                onClick={() => acceptMutation.mutate(r.friendshipId)}
                disabled={acceptMutation.isPending}
                size="small"
              >
                <CheckIcon />
              </IconButton>
              <IconButton
                onClick={() => declineMutation.mutate(r.friendshipId)}
                disabled={declineMutation.isPending}
                size="small"
              >
                <CloseIcon />
              </IconButton>
            </Box>
          }
        >
          <ListItemText
            primary={r.from.name}
            secondary={`Sent ${new Date(r.sentAt).toLocaleDateString()}`}
          />
        </ListItem>
      ))}
    </List>
  )
}

function FindFriendsTab() {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  const handleChange = useCallback((value: string) => {
    setQuery(value)
    if (debounceTimer) clearTimeout(debounceTimer)
    const timer = setTimeout(() => setDebouncedQuery(value), 300)
    setDebounceTimer(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounceTimer])

  const { data: results, isLoading } = useQuery({
    queryKey: ['friend-search', debouncedQuery],
    queryFn: () => searchUsers(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
  })

  const addMutation = useMutation({
    mutationFn: sendFriendRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friend-search'] })
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] })
    },
  })

  return (
    <Box>
      <TextField
        fullWidth
        placeholder="Search by name..."
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        size="small"
        sx={{ mb: 2 }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
          },
        }}
      />

      {addMutation.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(addMutation.error as any)?.response?.data?.error || 'Failed to send request'}
        </Alert>
      )}

      {isLoading && debouncedQuery.length >= 2 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box>
      )}

      {results && results.length === 0 && debouncedQuery.length >= 2 && (
        <Typography color="text.secondary" textAlign="center" sx={{ py: 4 }}>
          No users found matching "{debouncedQuery}"
        </Typography>
      )}

      {results && results.length > 0 && (
        <List disablePadding>
          {results.map((u) => (
            <ListItem key={u.id} divider secondaryAction={
              u.isFriend ? (
                <Chip label="Friends" size="small" color="success" variant="outlined" />
              ) : u.isPending ? (
                <Chip label="Pending" size="small" variant="outlined" />
              ) : (
                <IconButton
                  color="primary"
                  onClick={() => addMutation.mutate(u.id)}
                  disabled={addMutation.isPending}
                  size="small"
                >
                  <PersonAddIcon />
                </IconButton>
              )
            }>
              <ListItemText primary={u.name} />
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  )
}

export default function FriendsPage() {
  const [tab, setTab] = useState(0)
  const { data: requests } = useQuery({
    queryKey: ['friend-requests'],
    queryFn: getFriendRequests,
  })

  const pendingCount = requests?.length ?? 0

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', px: 2, py: 3 }}>
      <PageHeader title="Friends" />

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="fullWidth"
        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="Friends" />
        <Tab label={
          pendingCount > 0
            ? <Badge badgeContent={pendingCount} color="error" sx={{ '& .MuiBadge-badge': { right: -12, top: 2 } }}>Requests</Badge>
            : 'Requests'
        } />
        <Tab label="Find Friends" />
      </Tabs>

      {tab === 0 && <FriendsTab />}
      {tab === 1 && <RequestsTab />}
      {tab === 2 && <FindFriendsTab />}
    </Box>
  )
}
