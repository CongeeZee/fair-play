import { Avatar, type SxProps, type Theme } from '@mui/material'
import { Link } from 'react-router-dom'
import { avatarColor, initials } from '../lib/avatar'

interface Props {
  userId: number
  name: string
  size?: number
  /** Link to the user's profile. Off where the avatar sits inside another link. */
  link?: boolean
  sx?: SxProps<Theme>
}

export default function UserAvatar({ userId, name, size = 40, link = true, sx }: Props) {
  const linkProps = link ? { component: Link, to: `/profile/${userId}` } : {}
  return (
    <Avatar
      {...linkProps}
      alt={name}
      sx={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        bgcolor: avatarColor(userId),
        color: '#fff',
        textDecoration: 'none',
        flexShrink: 0,
        ...(sx as object),
      }}
    >
      {initials(name)}
    </Avatar>
  )
}
