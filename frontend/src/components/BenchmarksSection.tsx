import { Box, Card, CardContent, Chip, LinearProgress, Typography } from '@mui/material'
import GroupsIcon from '@mui/icons-material/Groups'
import { useQuery } from '@tanstack/react-query'
import { getBenchmarks } from '../api/rounds'
import type { BenchmarkMetricResult } from '../types'
import { CLAY } from '../theme'

/**
 * "How you compare" — anonymised peer benchmarking. Renders inside
 * <FeatureGate feature="benchmarks"> on StatsPage.
 *
 * Shows, per metric, where the user sits in their cohort (same 5-stroke
 * handicap band, falling back to all players for small bands) as a
 * horizontal percentile bar. All cohort numbers are aggregates — the
 * backend never exposes another player's identity or rounds.
 */

const fmtValue = (m: BenchmarkMetricResult, v: number | null): string => {
  if (v == null) return '–'
  if (m.key === 'girRate' || m.key === 'fairwayRate') return `${(v * 100).toFixed(0)}%`
  if (m.key === 'scoreToPar') return v === 0 ? 'E' : v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)
  if (m.key.startsWith('sg')) return v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2)
  return v.toFixed(2)
}

const percentileColor = (p: number) =>
  p >= 70 ? CLAY.greenLight : p >= 40 ? CLAY.goldGraphic : CLAY.red

function PercentileBar({ metric }: { metric: BenchmarkMetricResult }) {
  const p = metric.percentile
  if (p == null || metric.value == null) return null
  const color = percentileColor(p)

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5 }}>
        <Typography variant="body2" fontWeight={600}>
          {metric.label}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          You: <strong>{fmtValue(metric, metric.value)}</strong>
          {metric.cohortMedian != null && (
            <> · median {fmtValue(metric, metric.cohortMedian)}</>
          )}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <LinearProgress
          variant="determinate"
          value={p}
          sx={{
            flex: 1,
            height: 10,
            borderRadius: 5,
            bgcolor: 'grey.200',
            '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 5 },
          }}
        />
        <Typography variant="body2" fontWeight={700} sx={{ color, minWidth: 86, textAlign: 'right' }}>
          {p >= 95 ? 'Top 5%' : p <= 5 ? 'Bottom 5%' : `Top ${100 - p}%`}
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary">
        Ahead of {p}% · vs {metric.cohort === 'band' ? metric.cohortLabel : 'the field'} (n={metric.sampleSize})
      </Typography>
    </Box>
  )
}

export default function BenchmarksSection() {
  const { data } = useQuery({
    queryKey: ['benchmarks'],
    queryFn: getBenchmarks,
  })

  // Loading, errored (incl. a 402 if the feature is ever flipped to paid and
  // the gate hasn't caught it), or no comparable data yet: render nothing —
  // StatsPage already handles the global empty state.
  if (!data?.hasData || !data.metrics) return null

  const comparable = data.metrics.filter((m) => m.percentile != null && m.value != null)
  if (comparable.length === 0) return null

  // Did every metric fall back to the all-players cohort?
  const allFallback = comparable.every((m) => m.cohort === 'all')

  return (
    <Card elevation={1} sx={{ mb: 4 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <GroupsIcon sx={{ color: 'primary.main' }} />
          <Typography variant="h6" color="primary.main" fontWeight={700}>
            How You Compare
          </Typography>
          <Chip label="Anonymous" size="small" sx={{ height: 20, fontSize: 11 }} />
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          Your last {data.roundsAnalysed} round{data.roundsAnalysed !== 1 ? 's' : ''} vs{' '}
          {!allFallback && data.band
            ? `players in your handicap band (${data.band})`
            : 'all Fairplay players'}
          . Comparisons are fully anonymous — only aggregate percentiles, never anyone&apos;s rounds.
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {comparable.map((m) => (
            <PercentileBar key={m.key} metric={m} />
          ))}
        </Box>
      </CardContent>
    </Card>
  )
}
