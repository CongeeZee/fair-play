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
  keyGenerator: (req) => req.ip || "unknown",
});

export const moderateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message,
  keyGenerator: (req) => req.ip || "unknown",
});

export const standardLimiter = rateLimit({
  windowMs: 60_000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message,
  keyGenerator: userOrIpKey,
});
