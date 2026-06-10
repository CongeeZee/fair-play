import prisma from "./prisma";
import type { SubscriptionTier } from "./features";

// ─────────────────────────────────────────────────────────────────────────────
// getUserTier — resolves a user's effective subscription tier.
//
// FUTURE STRIPE INTEGRATION POINT:
// When billing ships, this is the ONLY function that needs to change. The
// Subscription model already exists; a Stripe webhook will populate rows on
// checkout/cancellation. Today the table is empty by design and every user
// resolves to the highest tier so nothing is gated — every flag in
// features.ts is FREE anyway, so the result is identical either way.
// ─────────────────────────────────────────────────────────────────────────────

export async function getUserTier(userId: number): Promise<SubscriptionTier> {
  // Read a Subscription row if it exists. Wrapped in try/catch so that — until
  // the migration is applied to every environment — a missing table can't
  // break every authenticated request.
  try {
    const sub = await prisma.subscription.findUnique({
      where: { userId },
      select: { tier: true, status: true },
    });
    if (sub && sub.status === "ACTIVE") {
      return sub.tier as SubscriptionTier;
    }
  } catch {
    // table not migrated yet — fall through to the default below.
  }

  // No billing yet: grant the highest tier so every feature is unlocked. When
  // FEATURE_REQUIREMENTS flips an entry to PRO/SOCIETY without a Subscription
  // row yet, this is what keeps existing users from being locked out.
  return "SOCIETY";
}
