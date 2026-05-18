import { Box, Card, CardContent, Typography, Paper } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Dot,
} from 'recharts'
import { getHandicapHistory } from '../api/rounds'
import { formatCourseName } from '../utils'

export default function HandicapTrendChart() {
  const { data: history } = useQuery({
    queryKey: ['handicap-history'],
    queryFn: getHandicapHistory,
  })

  if (!history || history.length === 0) {
    return (
      <Card elevation={1} sx={{ mb: 4 }}>
        <CardContent sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="body2" color="text.secondary">
            Play at least 3 rounds to see your handicap trend
          </Typography>
        </CardContent>
      </Card>
    )
  }

  const chartData = history.map((h, i) => ({
    index: i,
    date: new Date(h.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }),
    handicapIndex: h.handicapIndex,
    courseName: h.courseName,
    roundNumber: h.roundNumber,
  }))

  const values = chartData.map((d) => d.handicapIndex)
  const minVal = Math.floor(Math.min(...values) - 1)
  const maxVal = Math.ceil(Math.max(...values) + 1)

  return (
    <Card elevation={1} sx={{ mb: 4 }}>
      <CardContent>
        <Typography variant="h6" color="primary.main" gutterBottom>
          Handicap Trend
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Your handicap index after each round · lower is better
        </Typography>
        <Box sx={{ bgcolor: '#f5f0e8', borderRadius: 2, p: { xs: 1, sm: 2 } }}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d5cfc5" />
              <XAxis
                dataKey="index"
                type="number"
                domain={[0, chartData.length - 1]}
                ticks={
                  chartData.length <= 15
                    ? chartData.map((d) => d.index)
                    : chartData.filter((_, i) => i % Math.ceil(chartData.length / 10) === 0 || i === chartData.length - 1).map((d) => d.index)
                }
                tickFormatter={(i) => chartData[i]?.date ?? ''}
                tick={{ fontSize: 11, fill: '#888' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[minVal, maxVal]}
                reversed
                tickFormatter={(v) => v.toFixed(1)}
                tick={{ fontSize: 12, fill: '#888' }}
                axisLine={false}
                tickLine={false}
                width={40}
                label={{
                  value: '← Better',
                  position: 'insideTop',
                  offset: -4,
                  style: { fontSize: 10, fill: '#aaa', textAnchor: 'start' },
                }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload
                  return (
                    <Paper elevation={3} sx={{ p: 1.5, minWidth: 170 }}>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {d.date} · Round {d.roundNumber}
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 800, color: '#1a3a2a', my: 0.25 }}>
                        {d.handicapIndex.toFixed(1)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{
                        maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      }}>
                        {formatCourseName(d.courseName)}
                      </Typography>
                    </Paper>
                  )
                }}
              />
              <Line
                type="monotone"
                dataKey="handicapIndex"
                stroke="#1a3a2a"
                strokeWidth={2.5}
                dot={(props) => {
                  const { cx, cy } = props
                  return <Dot key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={4} fill="#c9a84c" stroke="#1a3a2a" strokeWidth={1.5} />
                }}
                activeDot={{ r: 7, fill: '#c9a84c', stroke: '#1a3a2a', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      </CardContent>
    </Card>
  )
}
