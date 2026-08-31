import rateLimit from "express-rate-limit";
import type { Request } from "express";
import type { AuthRequest } from "./auth";

const message = { error: "Too many requests, please try again later" };

function userOrIpKey(req: Request): string {
  const userId = (req as AuthRequest).userId;
  return userId ? `user:${userId}` : req.ip || "unknown";
}

/**
 * Sign-in and Google sign-in.
 *
 * This used to be a single 5-per-minute bucket shared by /auth/login,
 * /auth/register AND /auth/google. Two things made that lock real users out:
 *
 *  1. Successful requests consumed the budget, so simply reloading the app or
 *     signing in on a second device counted against you.
 *  2. It is keyed on `req.ip`. Behind a proxy — and with `trust proxy` unset,
 *     which it was — every request carries the *proxy's* address, so the whole
 *     user base shared one 5/minute bucket. See `configureTrustProxy` in
 *     app.ts for the other half of this fix.
 *
 * `skipSuccessfulRequests` is the important change: only failed attempts count,
 * so someone typing the right password is never throttled, while 20 wrong
 * guesses a minute still caps brute force (each one already pays bcrypt cost 12).
 */
export const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message,
  validate: false,
});

/**
 * Account creation. Successes DO count here — that is the point, it is what
 * caps automated signup floods — so this cannot use `skipSuccessfulRequests`.
 * 10/minute still leaves room for a family or an office to sign up together.
 */
export const signupLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message,
  validate: false,
});

/**
 * Password reset / email resend: emails cost money and are a spam vector, so
 * these stay tight. Kept separate from sign-in so a burst of reset requests
 * can't lock anyone out of logging in.
 */
export const strictLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message,
  validate: false,
});

// Token refresh happens on every app boot (reloads, multiple tabs), so it
// needs far more headroom than credential endpoints. Still bounded to stop
// brute-forcing refresh tokens.
export const refreshLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message,
  validate: false,
});

export const moderateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message,
  validate: false,
});

export const standardLimiter = rateLimit({
  windowMs: 60_000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message,
  keyGenerator: userOrIpKey,
  validate: false,
});
