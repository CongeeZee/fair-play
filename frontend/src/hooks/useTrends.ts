import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { getTrends } from '../api/rounds'
import type { TrendMetricKey } from '../types'

/**
 * Trend series for one metric. keepPreviousData stops the chart unmounting
 * (and the section collapsing) while the user flips between metrics.
 */
export function useTrends(metric: TrendMetricKey, window = 5) {
  return useQuery({
    queryKey: ['trends', metric, window],
    queryFn: () => getTrends(metric, window),
    placeholderData: keepPreviousData,
  })
}
