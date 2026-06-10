// ─────────────────────────────────────────────────────────────────────────────
// FEATURE GATING — SINGLE SOURCE OF TRUTH
// ─────────────────────────────────────────────────────────────────────────────
//
// Every gated feature in the app has an entry in FEATURE_REQUIREMENTS below.
// The required tier controls:
//   • backend middleware `requireFeature(key)` — 402s if user is below the tier
//   • frontend <FeatureGate feature="key">      — shows upsell if locked
//
// TODAY every entry is FREE, so nothing is gated and no upsell ever renders.
// All call sites are already wired, ready to flip.
//
// ─── FLIP-TO-PAID PATH ──────────────────────────────────────────────────────
// 1. Change a feature's tier below from FREE to PRO or SOCIETY.
// 2. Run prompt 8 to add Stripe + populate the Subscription table on checkout.
// 3. Done. The middleware will start blocking unsubscribed users with 402,
//    and <FeatureGate> will start rendering the upsell card automatically.
// ─────────────────────────────────────────────────────────────────────────────

export type SubscriptionTier = "FREE" | "PRO" | "SOCIETY";

// Numeric rank so we can compare tiers (higher = more access).
export const TIER_RANK: Record<SubscriptionTier, number> = {
  FREE: 0,
  PRO: 1,
  SOCIETY: 2,
};

export type FeatureKey =
  | "strokesGained"
  | "trends"
  | "benchmarks"
  | "projection"
  | "narrativeInsights"
  | "leagues";

// change to PRO/SOCIETY to start charging.
export const FEATURE_REQUIREMENTS: Record<FeatureKey, SubscriptionTier> = {
  strokesGained: "FREE",     // change to PRO/SOCIETY to start charging.
  trends: "FREE",            // change to PRO/SOCIETY to start charging.
  benchmarks: "FREE",        // change to PRO/SOCIETY to start charging.
  projection: "FREE",        // change to PRO/SOCIETY to start charging.
  narrativeInsights: "FREE", // change to PRO/SOCIETY to start charging.
  leagues: "FREE",           // change to PRO/SOCIETY to start charging.
};

export const FEATURE_KEYS = Object.keys(FEATURE_REQUIREMENTS) as FeatureKey[];

export function getRequiredTier(key: FeatureKey): SubscriptionTier {
  return FEATURE_REQUIREMENTS[key];
}

export function isFeatureFree(key: FeatureKey): boolean {
  return FEATURE_REQUIREMENTS[key] === "FREE";
}

export function tierMeets(userTier: SubscriptionTier, required: SubscriptionTier): boolean {
  return TIER_RANK[userTier] >= TIER_RANK[required];
}
