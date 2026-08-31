import { Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { AuthRequest } from "./auth";

/**
 * requireVerifiedEmail — gate a router behind a verified email address.
 *
 * Compose AFTER requireAuth.
 *
 * Five routers (friends, reactions, reviews, teetimes, competitions) each had
 * their own copy of this lookup, so every request to any of them paid an extra
 * `SELECT emailVerified FROM "User"` *before* the query it actually came for.
 * That is one more serial round-trip to the database on the critical path of
 * every social, review, tee-time and competition request — and against a
 * managed Postgres in another region, a round-trip is the dominant cost of the
 * whole request, not the query.
 *
 * So the affirmative answer is memoised in process. The correctness argument
 * is that `emailVerified` is monotonic: it is created `false` (schema default)
 * and only ever written `true`, by the verification route. Nothing sets it
 * back. Caching *only* the `true` result therefore cannot serve a stale answer
 * — an unverified user is re-checked on every request, so the moment they
 * verify they are let through, and a verified user can never need to be
 * un-let-through.
 *
 * If a "change your email re-verifies you" flow is ever added, that flow must
 * call `forgetVerifiedEmail(userId)`; this comment is the contract.
 */

/** User ids known to have a verified email. Positive answers only. */
const verified = new Set<number>();

/**
 * Bound the set so a long-lived process on a large user base cannot grow it
 * without limit. Well past any realistic concurrent-user count, and a reset
 * costs one query per active user, not a correctness problem.
 */
const MAX_ENTRIES = 10_000;

/** Drop a user from the cache. Call this if `emailVerified` ever goes false. */
export function forgetVerifiedEmail(userId: number): void {
  verified.delete(userId);
}

export function requireVerifiedEmail(message: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (verified.has(userId)) {
      next();
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerified: true },
    });

    if (!user?.emailVerified) {
      res.status(403).json({ error: message });
      return;
    }

    if (verified.size >= MAX_ENTRIES) verified.clear();
    verified.add(userId);
    next();
  };
}
