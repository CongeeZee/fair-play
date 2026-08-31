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

/**
 * posthog-js is ~190 kB raw / 64 kB gzipped. It used to be a static import,
 * which put it in the entry chunk's static graph: every visitor downloaded and
 * parsed it before the first route could render, and visitors on a build with
 * no `VITE_POSTHOG_KEY` downloaded it to run `initAnalytics`'s early return.
 * It was the single largest thing on the critical path that the first paint
 * did not need.
 *
 * So it is loaded on demand instead, off the critical path entirely. The
 * consequence to manage is that `capture()` can now be called before the
 * library has arrived — during the very first seconds of a session, which is
 * exactly when signup and onboarding events fire. Those are buffered and
 * replayed on load rather than dropped, so the event stream is unchanged;
 * only its timing moves.
 */
type PostHog = typeof import('posthog-js').default

let client: PostHog | null = null
let loading: Promise<PostHog | null> | null = null

/** Calls made before the library finished loading, replayed in order. */
const pending: Array<(ph: PostHog) => void> = []

function load(): Promise<PostHog | null> {
  if (!loading) {
    loading = import('posthog-js')
      .then(({ default: posthog }) => {
        posthog.init(KEY!, {
          api_host: HOST,
          capture_pageview: true,
          // Don't auto-capture every DOM interaction — we use explicit events only
          autocapture: false,
          // Don't persist identifiers across sessions for anonymous users beyond
          // PostHog's default; nothing extra to configure here.
        })
        client = posthog
        for (const call of pending.splice(0)) call(posthog)
        return posthog
      })
      .catch(() => {
        // An ad blocker or a network failure must never break the app. Drop
        // the buffer so it cannot grow without bound over a long session.
        pending.length = 0
        return null
      })
  }
  return loading
}

/**
 * Run `fn` against the live client, loading it first if necessary. A no-op
 * when there is no key, which is the dev/local case: nothing is fetched and
 * nothing leaks to PostHog.
 */
function withClient(fn: (ph: PostHog) => void) {
  if (!KEY || typeof window === 'undefined') return
  if (client) {
    fn(client)
    return
  }
  pending.push(fn)
  void load()
}

/**
 * Start the fetch. Called once at boot; it deliberately does not await, so
 * nothing about app startup is gated on analytics.
 */
export function initAnalytics() {
  if (!KEY || typeof window === 'undefined') return
  void load()
}

/**
 * Type-safe capture. The props parameter is required and inferred from the
 * event name, so call sites can't drift from the schema above.
 */
export function capture<E extends AnalyticsEventName>(
  event: E,
  props: AnalyticsEventProps[E],
) {
  withClient((ph) => ph.capture(event, props as Record<string, unknown>))
}

/**
 * Identify a logged-in user by their user id. Never pass email or other PII —
 * PostHog is for product analytics, not user records.
 */
export function identify(userId: string | number) {
  withClient((ph) => ph.identify(String(userId)))
}

/**
 * Clear the identified user on logout so subsequent events are anonymous.
 */
export function resetAnalytics() {
  withClient((ph) => ph.reset())
}
