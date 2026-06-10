import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth";
import {
  FeatureKey,
  getRequiredTier,
  isFeatureFree,
  tierMeets,
} from "../lib/features";
import { getUserTier } from "../lib/entitlement";

/**
 * requireFeature — gate a route behind a feature flag.
 *
 * Compose AFTER requireAuth. If the feature is FREE this is effectively a
 * no-op (it calls next() without touching the DB), so it's cheap to wire up
 * call sites today and flip the flag later.
 *
 *   router.get("/stats/strokes-gained",
 *     requireAuth,
 *     requireFeature("strokesGained"),
 *     handler);
 */
export function requireFeature(feature: FeatureKey) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const required = getRequiredTier(feature);

    if (isFeatureFree(feature)) {
      next();
      return;
    }

    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const userTier = await getUserTier(userId);
    if (!tierMeets(userTier, required)) {
      res.status(402).json({
        error: "Payment required",
        feature,
        requiredTier: required,
        currentTier: userTier,
      });
      return;
    }

    next();
  };
}
