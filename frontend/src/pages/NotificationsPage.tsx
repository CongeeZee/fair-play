import { useEffect } from 'react'
import { Box, Button, CircularProgress, List, ListItemButton, Paper, Typography, Alert } from '@mui/material'
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone'
import GolfCourseIcon from '@mui/icons-material/GolfCourse'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getNotifications, markNotificationsRead, type AppNotification, type NotificationInbox } from '../api/notifications'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import UserAvatar from '../components/UserAvatar'
import { timeAgo } from '../utils'
import { CLAY, tint } from '../theme'

/** Group headings so a long inbox scans by recency, like every phone's does. */
function bucket(dateStr: string): string {
  const d = new Date(dateStr)
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const days = (startOfToday.getTime() - new Date(d).setHours(0, 0, 0, 0)) / 864e5
  if (days <= 0) return 'Today'
  if (days < 7) return 'This week'
  return 'Earlier'
}

function NotificationRow({ n, onOpen }: { n: AppNotification; onOpen: (n: AppNotification) => void }) {
  return (
    <ListItemButton
      onClick={() => onOpen(n)}
      sx={{
        alignItems: 'flex-start',
        gap: 1.5,
        py: 1.5,
        px: 2,
        borderRadius: 0,
        bgcolor: n.read ? 'transparent' : tint(CLAY.green, 0.07),
      }}
    >
      {n.actor
        ? <UserAvatar userId={n.actor.id} name={n.actor.name} size={40} link={false} />
        : (
          <Box sx={{ width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'primary.main', color: CLAY.goldOnGreen, flexShrink: 0 }}>
            <GolfCourseIcon fontSize="small" />
          </Box>
        )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: n.read ? 500 : 700, lineHeight: 1.35 }}>
          {n.body}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {n.title} · {timeAgo(n.createdAt)}
        </Typography>
      </Box>
      {!n.read && (
        <Box aria-label="Unread" sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: 'primary.main', mt: 0.75, flexShrink: 0 }} />
      )}
    </ListItemButton>
  )
}

export default function NotificationsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: ['notifications'],
    queryFn: getNotifications,
    refetchOnWindowFocus: true,
  })

  const markRead = useMutation({
    mutationFn: markNotificationsRead,
    onSuccess: () => {
      queryClient.setQueryData(['notifications-unread'], 0)
      queryClient.setQueryData<NotificationInbox>(['notifications'], (old) => old && { ...old, unreadCount: 0 })
    },
  })

  // Opening the inbox clears the badge, but the rows keep their unread tint
  // for this visit so you can still see what was new.
  const unreadCount = data?.unreadCount ?? 0
  useEffect(() => {
    if (unreadCount > 0) markRead.mutate(undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadCount])

  const open = (n: AppNotification) => navigate(n.url)

  const groups: { label: string; items: AppNotification[] }[] = []
  for (const n of data?.items ?? []) {
    const label = bucket(n.createdAt)
    const g = groups.find((x) => x.label === label)
    if (g) g.items.push(n)
    else groups.push({ label, items: [n] })
  }

  return (
    <Box sx={{ maxWidth: 640, mx: 'auto', px: 2, pb: 4 }}>
      <PageHeader
        title="Notifications"
        action={unreadCount > 0 ? (
          <Button size="small" onClick={() => markRead.mutate(undefined)}>Mark all read</Button>
        ) : undefined}
      />

      {isLoading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>}
      {error && <Alert severity="error">Couldn't load notifications. Pull to refresh or try again shortly.</Alert>}

      {data && data.items.length === 0 && (
        <EmptyState
          icon={<NotificationsNoneIcon sx={{ fontSize: 36 }} />}
          title="You're all caught up"
          description="Reactions, comments, friend requests and invites will show up here."
          primary={{ label: 'Go to feed', to: '/feed' }}
        />
      )}

      {groups.map((g) => (
        <Box key={g.label} sx={{ mb: 2.5 }}>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 0.75, px: 0.5 }}>
            {g.label}
          </Typography>
          <Paper elevation={0} sx={{ overflow: 'hidden' }}>
            <List disablePadding>
              {g.items.map((n, i) => (
                <Box key={n.id} sx={{ borderTop: i === 0 ? 0 : '1px solid var(--c-borderC)' }}>
                  <NotificationRow n={n} onOpen={open} />
                </Box>
              ))}
            </List>
          </Paper>
        </Box>
      ))}
    </Box>
  )
}
