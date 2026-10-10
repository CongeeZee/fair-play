import { Box, Typography } from '@mui/material'
import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  /** Optional right-aligned actions (icon buttons, etc.) */
  action?: ReactNode
}

/**
 * Consistent typographic page header: a large, tight display title with an
 * optional one-line subtitle and right-aligned actions.
 *
 * Deliberately *not* a photo banner: a tall stock-photo strip on every page
 * wasted vertical space (especially on mobile) and repeated the same image
 * everywhere.
 */
export default function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 2,
        pt: { xs: 2.5, md: 4 },
        pb: 2,
        mb: 0.5,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="h4"
          component="h1"
          sx={{
            color: 'text.primary',
            lineHeight: 1.1,
            fontSize: { xs: '1.85rem', md: '2.25rem' },
          }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.75 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {action && <Box sx={{ flexShrink: 0, pb: 0.25 }}>{action}</Box>}
    </Box>
  )
}
