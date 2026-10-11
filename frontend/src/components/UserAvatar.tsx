import { Avatar, type SxProps, type Theme } from '@mui/material'
import { Link } from 'react-router-dom'
import { avatarColor, initials } from '../lib/avatar'
import { usePhotoVersion, photoUrl } from '../lib/photos'

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
  // Initials until (and unless) a photo is known; MUI falls back to the
  // initials by itself if the image fails to load.
  const version = usePhotoVersion(userId)
  return (
    <Avatar
      {...linkProps}
      alt={name}
      src={version ? photoUrl(userId, version) : undefined}
      slotProps={{ img: { loading: 'lazy', decoding: 'async', draggable: false } }}
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
