import type { ReactNode } from 'react'
import { Box, Typography, Button } from '@mui/material'
import { Link } from 'react-router-dom'

interface CTA {
  label: string
  to?: string
  onClick?: () => void
  icon?: ReactNode
}

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
  primary?: CTA
  secondary?: CTA
}

// Shared empty-state shell for first-run pages. Keeps a friendly icon halo,
// a serif headline, supporting copy, and up to two CTAs so a brand-new user
// always has somewhere to go from a blank screen.
export default function EmptyState({ icon, title, description, primary, secondary }: EmptyStateProps) {
  const renderCTA = (cta: CTA, variant: 'contained' | 'outlined') => {
    if (cta.to) {
      return (
        <Button
          variant={variant}
          component={Link}
          to={cta.to}
          startIcon={cta.icon}
          sx={{ textTransform: 'none', fontWeight: 600, px: 2.5 }}
        >
          {cta.label}
        </Button>
      )
    }
    return (
      <Button
        variant={variant}
        onClick={cta.onClick}
        startIcon={cta.icon}
        sx={{ textTransform: 'none', fontWeight: 600, px: 2.5 }}
      >
        {cta.label}
      </Button>
    )
  }

  return (
    <Box sx={{ textAlign: 'center', py: { xs: 6, sm: 8 }, px: 2, maxWidth: 420, mx: 'auto' }}>
      <Box
        sx={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          bgcolor: 'rgba(224,185,92,0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mx: 'auto',
          mb: 2,
          color: '#e0b95c',
        }}
      >
        {icon}
      </Box>
      <Typography
        variant="h6"
        sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, color: '#2f6b4c', mb: 1 }}
      >
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3, lineHeight: 1.6 }}>
        {description}
      </Typography>
      {(primary || secondary) && (
        <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap' }}>
          {primary && renderCTA(primary, 'contained')}
          {secondary && renderCTA(secondary, 'outlined')}
        </Box>
      )}
    </Box>
  )
}
