import { Typography, type TypographyProps } from '@mui/material'
import { Link } from 'react-router-dom'

interface ProfileLinkProps extends Omit<TypographyProps, 'component'> {
  userId: number
  name: string
}

export default function ProfileLink({ userId, name, sx, ...props }: ProfileLinkProps) {
  return (
    <Typography
      component={Link}
      to={`/profile/${userId}`}
      {...props}
      sx={{
        textDecoration: 'none',
        color: 'primary.main',
        fontWeight: 700,
        cursor: 'pointer',
        '&:hover': { textDecoration: 'underline' },
        ...sx,
      }}
    >
      {name}
    </Typography>
  )
}
