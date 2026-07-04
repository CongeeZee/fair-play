import rateLimit from "express-rate-limit";
import type { Request } from "express";
import type { AuthRequest } from "./auth";

const message = { error: "Too many requests, please try again later" };

function userOrIpKey(req: Request): string {
  const userId = (req as AuthRequest).userId;
  return userId ? `user:${userId}` : req.ip || "unknown";
}

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
