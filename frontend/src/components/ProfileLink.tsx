import { Box, type SxProps, type Theme } from '@mui/material'
import { Link } from 'react-router-dom'

interface ProfileLinkProps {
  userId: number
  name: string
  sx?: SxProps<Theme>
  variant?: string
  onClick?: (e: React.MouseEvent) => void
}

export default function ProfileLink({ userId, name, sx, variant = 'body2', onClick }: ProfileLinkProps) {
  const fontSizeMap: Record<string, string> = { body1: '1rem', body2: '0.875rem', caption: '0.75rem', subtitle2: '0.875rem', h5: '1.5rem', h6: '1.25rem' }
  return (
    <Box
      component={Link}
      to={`/profile/${userId}`}
      sx={{
        textDecoration: 'none',
        color: 'primary.main',
        fontWeight: 700,
        fontSize: fontSizeMap[variant],
        cursor: 'pointer',
        '&:hover': { textDecoration: 'underline' },
        ...sx as any,
      }}
      onClick={onClick}
    >
      {name}
    </Box>
  )
}
