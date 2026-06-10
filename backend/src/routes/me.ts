import { Router, Response } from "express";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { getUserTier } from "../lib/entitlement";
import { FEATURE_KEYS, getRequiredTier, tierMeets, FeatureKey } from "../lib/features";

const router = Router();
router.use(requireAuth);

router.get("/entitlements", async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const tier = await getUserTier(userId);

  const features: Record<FeatureKey, { unlocked: boolean }> = {} as Record<
    FeatureKey,
    { unlocked: boolean }
  >;
  for (const key of FEATURE_KEYS) {
    features[key] = { unlocked: tierMeets(tier, getRequiredTier(key)) };
  }

  res.json({ tier, features });
});

export default router;
