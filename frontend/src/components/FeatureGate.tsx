import type { ReactNode } from 'react'
import { Box, Button, Card, CardContent, Stack, Typography } from '@mui/material'
import LockIcon from '@mui/icons-material/Lock'
import { useEntitlements, type FeatureKey } from '../api/entitlements'

// Single source of upsell copy — tweak once, applies everywhere a FeatureGate
// renders the locked branch. Today no feature is locked, so this is dormant.
const UPSELL = {
  eyebrow: 'Fairplay Pro',
  title: 'Unlock the full picture of your game',
  body:
    'Strokes-gained analysis, trends, benchmarks, projections and league play — go deeper with Pro.',
  cta: 'Upgrade',
}

interface FeatureGateProps {
  feature: FeatureKey
  children: ReactNode
  /** Optional override for the locked-state render (e.g. inline lock chip). */
  fallback?: ReactNode
  /** Where the Upgrade CTA should send the user. */
  upgradeHref?: string
}

export function FeatureGate({
  feature,
  children,
  fallback,
  upgradeHref = '/upgrade',
}: FeatureGateProps) {
  const { data, isLoading } = useEntitlements()

  // While loading entitlements, optimistically render children — every flag is
  // FREE today so this is the correct answer 100% of the time, and it avoids a
  // flash of skeleton on every page.
  if (isLoading || !data) return <>{children}</>

  const unlocked = data.features[feature]?.unlocked ?? false
  if (unlocked) return <>{children}</>

  if (fallback) return <>{fallback}</>

  return (
    <Card
      variant="outlined"
      sx={{
        borderColor: 'secondary.main',
        background:
          'linear-gradient(135deg, rgba(47,107,76,0.04) 0%, rgba(224,185,92,0.10) 100%)',
      }}
    >
      <CardContent>
        <Stack spacing={1.5} alignItems="flex-start">
          <Stack direction="row" spacing={1} alignItems="center">
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                bgcolor: 'secondary.main',
                color: 'primary.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <LockIcon fontSize="small" />
            </Box>
            <Typography
              variant="overline"
              sx={{ color: 'secondary.dark', fontWeight: 700, letterSpacing: 1 }}
            >
              {UPSELL.eyebrow}
            </Typography>
          </Stack>
          <Typography variant="h6" sx={{ color: 'primary.main' }}>
            {UPSELL.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {UPSELL.body}
          </Typography>
          <Button
            href={upgradeHref}
            variant="contained"
            color="secondary"
            sx={{ color: 'primary.main', fontWeight: 700 }}
          >
            {UPSELL.cta}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  )
}

export default FeatureGate
