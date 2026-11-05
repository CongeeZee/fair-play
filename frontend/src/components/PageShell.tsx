import type { ReactNode } from 'react'
import { Box, useMediaQuery, useTheme } from '@mui/material'

/**
 * Centred page layout with optional side rails on wide screens.
 *
 * Phones and tablets get the main column alone. From `lg` up the grid is three
 * columns — two equal flexible sides around the main column — so the content
 * owns the exact middle of the page whichever rails are present. Centring the
 * *group* instead (main + one rail) pushed the content off-centre.
 *
 * Rails are mounted only at `lg`, not merely hidden with `display: none`: most
 * of them own queries, and a hidden-but-mounted rail would still run those on
 * every phone that opened the page.
 */
export default function PageShell({ left, right, maxWidth = 640, children }: {
  left?: ReactNode
  right?: ReactNode
  /** Width of the main column. */
  maxWidth?: number
  children: ReactNode
}) {
  const theme = useTheme()
  const wide = useMediaQuery(theme.breakpoints.up('lg'))

  const railSx = {
    position: 'sticky', top: 88, width: '100%', maxWidth: { lg: 270, xl: 300 },
    // Rails can outgrow a short viewport; let them scroll rather than clip
    maxHeight: 'calc(100vh - 104px)', overflowY: 'auto', scrollbarWidth: 'none',
    // Top of the rails lines up with the PageHeader title
    pt: 4,
  } as const

  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: {
        xs: `minmax(0, ${maxWidth}px)`,
        lg: `minmax(0, 1fr) minmax(0, ${maxWidth}px) minmax(0, 1fr)`,
      },
      justifyContent: 'center',
      columnGap: { lg: 3.5, xl: 4 },
      alignItems: 'start',
      px: 2,
    }}>
      {/* Left rail hugs the main column from the left, right rail from the right */}
      {wide && left && <Box sx={{ ...railSx, justifySelf: 'end', gridColumn: 1 }}>{left}</Box>}
      <Box sx={{ minWidth: 0, gridColumn: { xs: 1, lg: 2 }, gridRow: 1 }}>{children}</Box>
      {wide && right && <Box sx={{ ...railSx, justifySelf: 'start', gridColumn: 3 }}>{right}</Box>}
    </Box>
  )
}
