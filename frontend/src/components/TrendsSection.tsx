import { useState } from 'react'
import { Box, Card, CardContent, Chip, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import TimelineIcon from '@mui/icons-material/Timeline'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import TrendingDownIcon from '@mui/icons-material/TrendingDown'
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend,
} from 'recharts'
import { useTrends } from '../hooks/useTrends'
import type { TrendMetricKey, TrendsResult } from '../types'

const WINDOW = 5

const METRICS: Array<{ key: TrendMetricKey; label: string; shortLabel: string }> = [
  { key: 'scoreToPar', label: 'Score to Par', shortLabel: 'Score' },
  { key: 'putts', label: 'Putts per Hole', shortLabel: 'Putts' },
  { key: 'girRate', label: 'Greens in Regulation', shortLabel: 'GIR' },
  { key: 'fairwayRate', label: 'Fairways Hit', shortLabel: 'Fairways' },
  { key: 'strokesGained', label: 'Strokes Gained', shortLabel: 'SG' },
]

const isPercent = (m: TrendMetricKey) => m === 'girRate' || m === 'fairwayRate'
const isSigned = (m: TrendMetricKey) => m === 'scoreToPar' || m === 'strokesGained'

/** Display formatting per metric: % for rates, +/- for signed metrics. */
function fmtValue(metric: TrendMetricKey, v: number, signed = false): string {
  if (isPercent(metric)) {
    const pct = `${(v * 100).toFixed(0)}%`
    return signed && v > 0 ? `+${pct}` : pct
  }
  const s = Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(metric === 'scoreToPar' ? 1 : 2)
  return (signed || isSigned(metric)) && v > 0 ? `+${s}` : s
}

function DeltaChip({ metric, delta }: { metric: TrendMetricKey; delta: NonNullable<TrendsResult['delta']> }) {
  const styles = {
    improving: { icon: <TrendingUpIcon sx={{ fontSize: 16 }} />, color: '#4a8a68', bg: 'rgba(74,138,104,0.1)' },
    declining: { icon: <TrendingDownIcon sx={{ fontSize: 16 }} />, color: '#b0574c', bg: 'rgba(176,87,76,0.08)' },
    stable: { icon: <TrendingFlatIcon sx={{ fontSize: 16 }} />, color: '#666', bg: 'rgba(0,0,0,0.06)' },
  }[delta.direction]

  const label =
    delta.direction === 'stable'
      ? `Steady — last ${delta.window} vs previous ${delta.window}`
      : `${fmtValue(metric, delta.value, true)} — last ${delta.window} vs previous ${delta.window}`

  return (
    <Chip
      icon={styles.icon}
      label={label}
      size="small"
      sx={{
        fontWeight: 600,
        color: styles.color,
        bgcolor: styles.bg,
        '& .MuiChip-icon': { color: styles.color },
      }}
    />
  )
}

/**
 * Time-trend analytics — renders inside <FeatureGate feature="trends"> on
 * StatsPage. One metric at a time: raw per-round points plus a rolling
 * average, with a last-N-vs-previous-N delta chip. Data semantics live in
 * backend/src/lib/roundMetrics.ts.
 */
export default function TrendsSection() {
  const [metric, setMetric] = useState<TrendMetricKey>('scoreToPar')
  const { data, isLoading } = useTrends(metric, WINDOW)

  // Nothing scored yet at all: stay hidden, StatsPage owns the global empty
  // state. (Metric-specific "no tracked data" still renders below, so users
  // discover that e.g. fairway trends unlock by tracking tee shots.)
  if (!data && isLoading) return null
  if (data && !data.hasData && metric === 'scoreToPar') return null

  const series = (data?.series ?? []).map((p, i) => ({
    ...p,
    round: i + 1,
    date: new Date(p.playedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  }))

  const metricMeta = METRICS.find((m) => m.key === metric)!

  return (
    <Card elevation={1} sx={{ mb: 4 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
          <TimelineIcon sx={{ color: 'primary.main' }} />
          <Typography variant="h6" color="primary.main" fontWeight={700}>
            Trends
          </Typography>
          {data?.delta && <DeltaChip metric={metric} delta={data.delta} />}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {metricMeta.label} per round with a {data?.window ?? WINDOW}-round rolling average
          {data?.roundsAnalysed ? `, across ${data.roundsAnalysed} round${data.roundsAnalysed !== 1 ? 's' : ''}` : ''}.
        </Typography>

        <ToggleButtonGroup
          value={metric}
          exclusive
          size="small"
          onChange={(_, v: TrendMetricKey | null) => v && setMetric(v)}
          sx={{ mb: 2, flexWrap: 'wrap', '& .MuiToggleButton-root': { px: 1.5, py: 0.5, textTransform: 'none', fontWeight: 600 } }}
        >
          {METRICS.map((m) => (
            <ToggleButton key={m.key} value={m.key}>{m.shortLabel}</ToggleButton>
          ))}
        </ToggleButtonGroup>

        {series.length >= 2 ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ded6c8" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#888' }} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis
                tick={{ fontSize: 12, fill: '#888' }}
                axisLine={false}
                tickLine={false}
                width={46}
                domain={['auto', 'auto']}
                tickFormatter={(v: number) => fmtValue(metric, v)}
              />
              <Tooltip
                formatter={(value, name) => [
                  fmtValue(metric, Number(value)),
                  name === 'rollingAvg' ? `${data?.window ?? WINDOW}-round avg` : metricMeta.shortLabel,
                ]}
                labelFormatter={(label, payload) =>
                  payload?.[0]?.payload?.courseName
                    ? `${payload[0].payload.courseName} — ${label}`
                    : String(label)
                }
              />
              <Legend
                formatter={(name: string) =>
                  name === 'rollingAvg' ? `${data?.window ?? WINDOW}-round average` : 'Per round'
                }
                wrapperStyle={{ fontSize: 12 }}
              />
              {/* Raw rounds: light line + dots so single noisy rounds stay visible */}
              <Line
                type="monotone"
                dataKey="value"
                stroke="#a9bfb2"
                strokeWidth={1.5}
                dot={{ r: 3, fill: '#a9bfb2', strokeWidth: 0 }}
                isAnimationActive={false}
              />
              {/* Rolling average: the actual trend signal */}
              <Line
                type="monotone"
                dataKey="rollingAvg"
                stroke="#4a8a68"
                strokeWidth={2.5}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
            {metric === 'putts' && 'Track putts while scoring to see your putting trend.'}
            {metric === 'girRate' && 'Track approach results while scoring to see your GIR trend.'}
            {metric === 'fairwayRate' && 'Track tee shots while scoring to see your fairway trend.'}
            {(metric === 'scoreToPar' || metric === 'strokesGained') &&
              'Play a couple more rounds to see a trend here.'}
          </Typography>
        )}

        {data?.delta == null && series.length >= 2 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Trend direction unlocks once you have {(data?.window ?? WINDOW) * 2} rounds with this stat tracked.
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}
