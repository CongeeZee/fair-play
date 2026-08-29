import { useState, useMemo } from 'react'
import {
  Box, Chip, Typography, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, Button, TextField, List, ListItemButton, ListItemText,
  Checkbox, CircularProgress,
} from '@mui/material'
import GroupAddIcon from '@mui/icons-material/GroupAdd'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getFriends } from '../api/friends'
import { setRoundPartners } from '../api/rounds'
import type { RoundPartner } from '../types'

interface Props {
  roundId: string | number
  partners: RoundPartner[]
}

export default function PlayingPartnersPicker({ roundId, partners }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<number[]>(partners.map((p) => p.id))
  const queryClient = useQueryClient()

  const friendsQuery = useQuery({
    queryKey: ['friends'],
    queryFn: getFriends,
    enabled: open,
  })

  const mutation = useMutation({
    mutationFn: (userIds: number[]) => setRoundPartners(roundId, userIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['round', String(roundId)] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      setOpen(false)
    },
  })

  const handleOpen = () => {
    setSelected(partners.map((p) => p.id))
    setQuery('')
    setOpen(true)
  }

  const handleRemoveChip = (userId: number) => {
    const next = partners.filter((p) => p.id !== userId).map((p) => p.id)
    mutation.mutate(next)
  }

  const filteredFriends = useMemo(() => {
    const friends = friendsQuery.data ?? []
    if (!query.trim()) return friends
    const q = query.toLowerCase()
    return friends.filter((f) => f.name.toLowerCase().includes(q))
  }, [friendsQuery.data, query])

  const toggle = (userId: number) => {
    setSelected((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]))
  }

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1.5, flexWrap: 'wrap' }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mr: 0.5 }}>
          Played with
        </Typography>
        {partners.map((p) => (
          <Chip
            key={p.id}
            label={p.name}
            size="small"
            onDelete={() => handleRemoveChip(p.id)}
            sx={{ height: 24, fontSize: '0.75rem', bgcolor: 'rgba(47,107,76,0.08)' }}
          />
        ))}
        <IconButton
          size="small"
          onClick={handleOpen}
          sx={{
            border: '1px dashed',
            borderColor: 'divider',
            width: 24,
            height: 24,
            color: 'text.secondary',
          }}
        >
          <GroupAddIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>Tag playing partners</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Search friends..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            sx={{ mb: 1 }}
            autoFocus
          />
          {friendsQuery.isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : filteredFriends.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
              {friendsQuery.data && friendsQuery.data.length === 0
                ? 'Add some friends first to tag them on rounds.'
                : 'No friends match that search.'}
            </Typography>
          ) : (
            <List dense sx={{ maxHeight: 320, overflowY: 'auto' }}>
              {filteredFriends.map((f) => {
                const checked = selected.includes(f.id)
                return (
                  <ListItemButton key={f.id} onClick={() => toggle(f.id)} dense>
                    <Checkbox edge="start" checked={checked} tabIndex={-1} disableRipple size="small" />
                    <ListItemText
                      primary={f.name}
                      secondary={f.handicapIndex != null ? `HCP ${f.handicapIndex.toFixed(1)}` : undefined}
                    />
                  </ListItemButton>
                )
              })}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={mutation.isPending}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => mutation.mutate(selected)}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
