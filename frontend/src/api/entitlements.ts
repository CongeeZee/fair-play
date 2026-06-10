import { useQuery } from '@tanstack/react-query'
import client from './client'

export type SubscriptionTier = 'FREE' | 'PRO' | 'SOCIETY'

export type FeatureKey =
  | 'strokesGained'
  | 'trends'
  | 'benchmarks'
  | 'projection'
  | 'narrativeInsights'
  | 'leagues'

export interface EntitlementsResponse {
  tier: SubscriptionTier
  features: Record<FeatureKey, { unlocked: boolean }>
}

export const getEntitlements = () =>
  client.get<EntitlementsResponse>('/me/entitlements').then((r) => r.data)

export function useEntitlements() {
  return useQuery({
    queryKey: ['entitlements'],
    queryFn: getEntitlements,
    staleTime: 5 * 60 * 1000, // entitlements rarely change mid-session
  })
}
