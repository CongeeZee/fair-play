import { Box, Typography } from '@mui/material'
import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  /** Optional right-aligned actions (icon buttons, etc.) */
  action?: ReactNode
}

/**
 * Consistent typographic page header.
 *
 * Deliberately *not* a photo banner: a tall stock-photo strip on every page
 * wasted vertical space (especially on mobile), repeated the same image
 * everywhere, and broke when squeezed into narrow flex rows. A clean serif
 * title with a gold accent keeps the brand feel without the cost.
 */
export default function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 2,
        pt: { xs: 2.5, md: 3.5 },
        pb: subtitle ? 2 : 1.5,
        mb: 1,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="h4"
          component="h1"
          sx={{
            color: 'primary.main',
            fontWeight: 700,
            lineHeight: 1.1,
            fontSize: { xs: '1.75rem', md: '2.125rem' },
          }}
        >
          {title}
        </Typography>
        <Box
          sx={{
            width: 36,
            height: 3,
            borderRadius: 1.5,
            bgcolor: 'secondary.main',
            mt: 1,
            mb: subtitle ? 1 : 0,
          }}
        />
        {subtitle && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {action && <Box sx={{ flexShrink: 0, pb: 0.5 }}>{action}</Box>}
    </Box>
  )
}
