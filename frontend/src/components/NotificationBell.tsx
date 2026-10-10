import { Badge, IconButton, Tooltip } from '@mui/material'
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getUnreadCount } from '../api/notifications'

/**
 * Bell with an unread badge, linking to the inbox. Polls a count-only endpoint
 * once a minute (and on focus), so the badge stays fresh without pulling the
 * whole list on every screen.
 */
export default function NotificationBell({ color }: { color: string }) {
  const { data: unread = 0 } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: getUnreadCount,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  })
  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'

  return (
    <Tooltip title="Notifications">
      <IconButton component={Link} to="/notifications" aria-label={label} size="small" sx={{ color, borderRadius: 999 }}>
        <Badge badgeContent={unread} color="error" max={99} overlap="circular">
          <NotificationsNoneIcon sx={{ fontSize: 22 }} />
        </Badge>
      </IconButton>
    </Tooltip>
  )
}
