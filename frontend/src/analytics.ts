// Lightweight PostHog wrapper.
//
// If VITE_POSTHOG_KEY is unset (dev/local), every call is a silent no-op so
// nothing leaks to PostHog and no extra script loads.
//
// Event catalogue — keep this list as the single source of truth for event
// names so dashboards and code stay in sync.
//
//   signup_completed     — a new account was created (email/password or Google)
//   round_started        — the user started a new round on a course
//   round_completed      — the user finished a round (all holes scored)
//   friend_added         — the user accepted a friend request
//   competition_created  — the user created a new competition
//   competition_joined   — the user accepted an invite to a competition
//   invite_link_created  — the user generated a shareable scorecard/invite link

import posthog from 'posthog-js'

export const AnalyticsEvent = {
  SignupCompleted: 'signup_completed',
  RoundStarted: 'round_started',
  RoundCompleted: 'round_completed',
  FriendAdded: 'friend_added',
  CompetitionCreated: 'competition_created',
  CompetitionJoined: 'competition_joined',
  InviteLinkCreated: 'invite_link_created',
} as const

export type AnalyticsEventName =
  (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent]

// Per-event property shapes. Keep these to non-sensitive identifiers/metadata.
export interface AnalyticsEventProps {
  [AnalyticsEvent.SignupCompleted]: { method: 'email' | 'google' }
  [AnalyticsEvent.RoundStarted]: { courseId?: number; externalCourseId?: string }
  [AnalyticsEvent.RoundCompleted]: { roundId: number; holes: number }
  [AnalyticsEvent.FriendAdded]: Record<string, never>
  [AnalyticsEvent.CompetitionCreated]: {
    competitionId: string
    scoringType: 'NET' | 'GROSS' | 'STABLEFORD'
    invitedCount: number
  }
  [AnalyticsEvent.CompetitionJoined]: { competitionId: string }
  [AnalyticsEvent.InviteLinkCreated]:
    | { kind: 'scorecard'; roundId: number }
    | { kind: 'friend'; label?: string; hasMaxUses: boolean; hasExpiry: boolean }
}

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined
const HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ??
  'https://us.i.posthog.com'

let initialised = false

export function initAnalytics() {
  if (initialised || !KEY || typeof window === 'undefined') return
  posthog.init(KEY, {
    api_host: HOST,
    capture_pageview: true,
    // Don't auto-capture every DOM interaction — we use explicit events only
    autocapture: false,
    // Don't persist identifiers across sessions for anonymous users beyond
    // PostHog's default; nothing extra to configure here.
  })
  initialised = true
}

function enabled(): boolean {
  return initialised && !!KEY
}

/**
 * Type-safe capture. The props parameter is required and inferred from the
 * event name, so call sites can't drift from the schema above.
 */
export function capture<E extends AnalyticsEventName>(
  event: E,
  props: AnalyticsEventProps[E],
) {
  if (!enabled()) return
  posthog.capture(event, props as Record<string, unknown>)
}

/**
 * Identify a logged-in user by their user id. Never pass email or other PII —
 * PostHog is for product analytics, not user records.
 */
export function identify(userId: string | number) {
  if (!enabled()) return
  posthog.identify(String(userId))
}

/**
 * Clear the identified user on logout so subsequent events are anonymous.
 */
export function resetAnalytics() {
  if (!enabled()) return
  posthog.reset()
}
