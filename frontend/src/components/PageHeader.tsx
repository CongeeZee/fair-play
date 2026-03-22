import { Box, Typography } from '@mui/material'

const BANNER_IMAGE =
  'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?auto=format&fit=crop&w=1920&q=80'

interface PageHeaderProps {
  title: string
  subtitle?: string
}

export default function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <Box
      sx={{
        height: 160,
        display: 'flex',
        alignItems: 'flex-end',
        pb: 3,
        px: { xs: 3, md: 6 },
        backgroundImage: `
          linear-gradient(to bottom, rgba(10,25,16,0.5) 0%, rgba(10,25,16,0.82) 100%),
          url('${BANNER_IMAGE}')
        `,
        backgroundSize: 'cover',
        backgroundPosition: 'center 30%',
      }}
    >
      <Box>
        <Typography
          variant="h4"
          sx={{ color: '#fff', fontWeight: 700, lineHeight: 1, mb: subtitle ? 0.5 : 0 }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.65)' }}>
            {subtitle}
          </Typography>
        )}
      </Box>
    </Box>
  )
}
