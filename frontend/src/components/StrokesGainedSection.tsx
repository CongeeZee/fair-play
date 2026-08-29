import { Box, Card, CardContent, Chip, Tooltip as MuiTooltip, Typography } from '@mui/material'
import InsightsIcon from '@mui/icons-material/Insights'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine,
  ResponsiveContainer, Cell, Tooltip,
} from 'recharts'
import { getStrokesGained } from '../api/rounds'
import type { SGCategoryKey } from '../types'
import { CLAY } from '../theme'

const CATEGORY_LABELS: Record<SGCategoryKey, string> = {
  offTheTee: 'Off the Tee',
  approach: 'Approach',
  aroundGreen: 'Around Green',
  putting: 'Putting',
}

const CATEGORY_ORDER: SGCategoryKey[] = ['offTheTee', 'approach', 'aroundGreen', 'putting']

const fmtSG = (v: number) => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2))

/**
 * Strokes Gained (simplified) — renders inside <FeatureGate feature="strokesGained">
 * on StatsPage. Numbers come from outcome proxies (fairways, GIR, scrambling,
 * putts), not shot-by-shot data; see backend/src/lib/strokesGained.ts.
 */
export default function StrokesGainedSection() {
  const { data } = useQuery({
    queryKey: ['strokes-gained'],
    queryFn: getStrokesGained,
  })

  // Loading, errored (incl. a 402 if the feature is ever flipped to paid and
  // the gate hasn't caught it), or no scored rounds yet: render nothing —
  // StatsPage already handles the global empty state.
  if (!data?.hasData || !data.categories) return null

  const categories = data.categories
  const chartData = CATEGORY_ORDER.map((key) => ({
    key,
    label: CATEGORY_LABELS[key],
    value: categories[key].averagePerRound,
    tracked: categories[key].dataCompleteness.trackedHoles,
    sufficient: categories[key].dataCompleteness.sufficient,
  }))

  const anyValue = chartData.some((d) => d.value != null)

  return (
    <Card elevation={1} sx={{ mb: 4 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <InsightsIcon sx={{ color: 'primary.main' }} />
          <Typography variant="h6" color="primary.main" fontWeight={700}>
            Strokes Gained
          </Typography>
          <Chip label="Estimated" size="small" sx={{ height: 20, fontSize: 11 }} />
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Average strokes gained per round vs a {data.band === 'low' ? 'low' : data.band === 'high' ? 'high' : 'mid'}-handicap
          baseline, over your last {data.roundsAnalysed} round{data.roundsAnalysed !== 1 ? 's' : ''}.
          Estimated from your tracked fairways, greens, scrambling and putts — not shot-by-shot data.
        </Typography>

        {anyValue ? (
          <>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={chartData.filter((d) => d.value != null)}
                margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#ded6c8" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: CLAY.inkSoft }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(v: number) => (v > 0 ? `+${v}` : `${v}`)}
                  tick={{ fontSize: 12, fill: CLAY.inkSoft }}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                />
                <ReferenceLine y={0} stroke={CLAY.inkSoft} strokeWidth={1.5} />
                <Tooltip
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                  formatter={(value) => [fmtSG(Number(value)), 'SG / round']}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={56}>
                  {chartData.filter((d) => d.value != null).map((d) => (
                    <Cell
                      key={d.key}
                      fill={d.value! >= 0 ? CLAY.greenLight : CLAY.red}
                      fillOpacity={d.sufficient ? 1 : 0.4}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Per-category captions: value + tracked-holes provenance */}
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: 2 }}>
              {chartData.map((d) => (
                <Box
                  key={d.key}
                  sx={{
                    flex: 1, minWidth: 130, textAlign: 'center', px: 1.5, py: 1,
                    bgcolor: 'background.default', borderRadius: 2,
                  }}
                >
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {d.label}
                  </Typography>
                  <Typography
                    variant="h6"
                    fontWeight={700}
                    sx={{ color: d.value == null ? 'text.disabled' : d.value >= 0 ? CLAY.greenText : CLAY.errorText }}
                  >
                    {d.value == null ? '–' : fmtSG(d.value)}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      based on {d.tracked} tracked hole{d.tracked !== 1 ? 's' : ''}
                    </Typography>
                    {!d.sufficient && (
                      <MuiTooltip title="Not enough tracked holes yet to trust this number — keep logging fairways, greens and putts.">
                        <WarningAmberIcon sx={{ fontSize: 14, color: CLAY.warningText }} />
                      </MuiTooltip>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          </>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Track putts, fairways and greens while scoring to unlock strokes-gained estimates.
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}
