import { Router, Request, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
import prisma from "../lib/prisma";
import { sendValidationError } from "../lib/validation";
import { sendVerificationEmail, sendPasswordResetEmail } from "../lib/email";
import { requireAuth, type AuthRequest } from "../middleware/auth";
import { forgetVerifiedEmail } from "../middleware/requireVerifiedEmail";
import {
  authLimiter,
  signupLimiter,
  strictLimiter,
  refreshLimiter,
} from "../middleware/rateLimiter";

const googleClient = new OAuth2Client();

// The audience check in verifyIdToken is SKIPPED when `audience` is undefined,
// which would accept any Google-issued ID token — including ones minted for a
// completely different app — and let an attacker sign in as any user by email.
// Fail closed instead of verifying nothing.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
if (!GOOGLE_CLIENT_ID) {
  console.warn(
    "GOOGLE_CLIENT_ID is not set — POST /auth/google will reject every request. " +
      "Set it to the same client ID the frontend uses (VITE_GOOGLE_CLIENT_ID).",
  );
}

const router = Router();

const REFRESH_TOKEN_EXPIRY_DAYS = 30;

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

function signAccessToken(userId: number): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is not set");
  return jwt.sign({ userId }, secret, { expiresIn: "15m" });
}

async function createRefreshToken(userId: number): Promise<string> {
  const raw = crypto.randomBytes(40).toString("hex");
  const hashed = crypto.createHash("sha256").update(raw).digest("hex");
  const expiresAt = new Date(
    Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  );

  await prisma.refreshToken.create({
    data: { token: hashed, userId, expiresAt },
  });

  return raw;
}

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

interface AuthUser {
  id: number;
  email: string;
  name: string;
  emailVerified: boolean;
  hasCompletedOnboarding: boolean;
}

async function issueTokens(user: AuthUser, res: Response, status = 200) {
  const accessToken = signAccessToken(user.id);
  const refreshToken = await createRefreshToken(user.id);

  res.status(status).json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      hasCompletedOnboarding: user.hasCompletedOnboarding,
    },
    token: accessToken,
    refreshToken,
  });
}

// POST /auth/register
router.post("/register", signupLimiter, async (req: Request, res: Response) => {
  const result = registerSchema.safeParse(req.body);
  if (!result.success) {
    sendValidationError(res, result.error);
    return;
  }

  const { email, password, name } = result.data;

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const verificationToken = crypto.randomUUID();

    const user = await prisma.user.create({
      data: { email, passwordHash, name, verificationToken },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
        hasCompletedOnboarding: true,
        createdAt: true,
      },
    });

    // Fire-and-forget — don't block registration on email delivery
    sendVerificationEmail(email, verificationToken);

    await issueTokens(user, res, 201);
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /auth/login
router.post("/login", authLimiter, async (req: Request, res: Response) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    sendValidationError(res, result.error);
    return;
  }

  const { email, password } = result.data;

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    const dummyHash =
      "$2b$12$invalidhashfortimingprotectionxxxxxxxxxxxxxxxxxxxxxxxx";
    const valid = await bcrypt.compare(
      password,
      user?.passwordHash || dummyHash,
    );

    if (!user || !valid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    await issueTokens(user, res);
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /auth/google
router.post("/google", authLimiter, async (req: Request, res: Response) => {
  const { credential } = req.body;
  if (!credential) {
    res.status(400).json({ error: "Missing credential" });
    return;
  }

  if (!GOOGLE_CLIENT_ID) {
    console.error("Google auth error: GOOGLE_CLIENT_ID is not configured");
    res.status(500).json({ error: "Google sign-in is not configured" });
    return;
  }

  // Verify the token first, on its own. Everything after this point is our own
  // infrastructure (database, token issuing) — folding those failures into the
  // same catch reported a DB outage to the user as "Google authentication
  // failed", which sent us hunting for an OAuth bug that did not exist.
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (err) {
    console.error("Google token verification failed:", err);
    res.status(401).json({ error: "Google authentication failed" });
    return;
  }

  if (!payload || !payload.email) {
    res.status(401).json({ error: "Invalid Google token" });
    return;
  }

  try {
    const { sub: googleId, email, name } = payload;

    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
    });

    if (user) {
      // Link Google + mark verified if not already
      const updates: { googleId?: string; emailVerified?: boolean; verificationToken?: null } = {};
      if (!user.googleId) updates.googleId = googleId;
      if (!user.emailVerified) {
        updates.emailVerified = true;
        updates.verificationToken = null;
      }
      if (Object.keys(updates).length > 0) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: updates,
        });
      }
    } else {
      user = await prisma.user.create({
        data: {
          email,
          name: name || email.split("@")[0],
          googleId,
          emailVerified: true,
        },
      });
    }

    await issueTokens(user, res);
  } catch (err) {
    console.error("Google auth error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /auth/refresh
router.post("/refresh", refreshLimiter, async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(400).json({ error: "Missing refresh token" });
    return;
  }

  try {
    const hashed = hashToken(refreshToken);
    const stored = await prisma.refreshToken.findUnique({
      where: { token: hashed },
      include: {
        user: {
          select: { id: true, email: true, name: true, emailVerified: true, hasCompletedOnboarding: true },
        },
      },
    });

    if (!stored) {
      res.status(401).json({ error: "Invalid refresh token" });
      return;
    }

    await prisma.refreshToken.delete({ where: { id: stored.id } });

    if (stored.expiresAt < new Date()) {
      res.status(401).json({ error: "Refresh token expired" });
      return;
    }

    await issueTokens(stored.user, res);
  } catch (err) {
    console.error("Refresh error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /auth/logout
router.post("/logout", async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(200).json({ ok: true });
    return;
  }

  try {
    const hashed = hashToken(refreshToken);
    await prisma.refreshToken.deleteMany({ where: { token: hashed } });
  } catch {
    // Silently ignore
  }

  res.json({ ok: true });
});

// GET /auth/verify-email/:token
router.get("/verify-email/:token", async (req: Request, res: Response) => {
  const token = String(req.params.token);

  try {
    const user = await prisma.user.findUnique({
      where: { verificationToken: token },
    });

    if (!user) {
      res.status(400).json({ error: "Invalid or expired verification link" });
      return;
    }

    if (user.emailVerified) {
      res.json({ message: "Email already verified" });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verificationToken: null },
    });

    res.json({ message: "Email verified successfully" });
  } catch (err) {
    console.error("Verify email error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Simple in-memory rate limiter for resend
const resendCooldowns = new Map<number, number>();

// POST /auth/resend-verification
router.post(
  "/resend-verification",
  strictLimiter,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;

    // Rate limit: 1 per minute
    const lastSent = resendCooldowns.get(userId) || 0;
    if (Date.now() - lastSent < 60_000) {
      const waitSeconds = Math.ceil((60_000 - (Date.now() - lastSent)) / 1000);
      res
        .status(429)
        .json({ error: `Please wait ${waitSeconds}s before requesting again` });
      return;
    }

    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      if (user.emailVerified) {
        res.json({ message: "Email already verified" });
        return;
      }

      const verificationToken = crypto.randomUUID();
      await prisma.user.update({
        where: { id: userId },
        data: { verificationToken },
      });

      resendCooldowns.set(userId, Date.now());
      sendVerificationEmail(user.email, verificationToken);

      res.json({ message: "Verification email sent" });
    } catch (err) {
      console.error("Resend verification error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /auth/forgot-password
// Always responds 200 to avoid leaking whether the email exists.
router.post("/forgot-password", strictLimiter, async (req: Request, res: Response) => {
  const result = forgotPasswordSchema.safeParse(req.body);
  if (!result.success) {
    sendValidationError(res, result.error);
    return;
  }

  const { email } = result.data;

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    // Only send a real reset link if the user exists AND has a password
    // (Google-only accounts have no passwordHash and can't reset).
    if (user && user.passwordHash) {
      const resetToken = crypto.randomUUID();
      const passwordResetExpires = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS);

      await prisma.user.update({
        where: { id: user.id },
        data: { passwordResetToken: resetToken, passwordResetExpires },
      });

      sendPasswordResetEmail(user.email, resetToken);
    }

    res.json({
      message:
        "If an account exists for that email, a password reset link has been sent.",
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    // Still respond 200 to preserve the no-leak guarantee
    res.json({
      message:
        "If an account exists for that email, a password reset link has been sent.",
    });
  }
});

// POST /auth/reset-password
router.post("/reset-password", strictLimiter, async (req: Request, res: Response) => {
  const result = resetPasswordSchema.safeParse(req.body);
  if (!result.success) {
    sendValidationError(res, result.error);
    return;
  }

  const { token, newPassword } = result.data;

  try {
    const user = await prisma.user.findUnique({
      where: { passwordResetToken: token },
    });

    if (
      !user ||
      !user.passwordResetExpires ||
      user.passwordResetExpires < new Date()
    ) {
      res.status(400).json({ error: "Invalid or expired reset link" });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordResetToken: null,
          passwordResetExpires: null,
        },
      }),
      // Invalidate all existing sessions
      prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
    ]);

    res.json({ message: "Password reset successfully" });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /auth/onboarding-complete — mark onboarding done
router.patch("/onboarding-complete", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.user.update({
      where: { id: req.userId! },
      data: { hasCompletedOnboarding: true },
    });
    res.json({ success: true });
  } catch (err) {
    console.error("PATCH /auth/onboarding-complete error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /auth/profile — update display name
router.patch("/profile", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "Name is required" });
      return;
    }
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 50) {
      res.status(400).json({ error: "Name must be 1-50 characters" });
      return;
    }
    const user = await prisma.user.update({
      where: { id: req.userId! },
      data: { name: trimmed },
      select: { id: true, name: true, email: true, emailVerified: true, hasCompletedOnboarding: true, createdAt: true },
    });
    res.json(user);
  } catch (err) {
    console.error("PATCH /auth/profile error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /auth/account — what the settings page needs to know about sign-in methods
router.get("/account", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { email: true, passwordHash: true, googleId: true, createdAt: true },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({
      email: user.email,
      hasPassword: user.passwordHash != null,
      googleLinked: user.googleId != null,
      createdAt: user.createdAt,
    });
  } catch (err) {
    console.error("GET /auth/account error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const changePasswordSchema = z.object({
  // Optional only for accounts created with Google, which have no password yet
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, "Password must be at least 8 characters").max(200),
});

// POST /auth/change-password — change (or, for Google-only accounts, set) a password.
// Signs out every other session: if the old password leaked, the sessions it
// opened should not outlive it.
router.post("/change-password", requireAuth, strictLimiter, async (req: AuthRequest, res: Response) => {
  const result = changePasswordSchema.safeParse(req.body);
  if (!result.success) {
    sendValidationError(res, result.error);
    return;
  }
  const { currentPassword, newPassword } = result.data;

  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (user.passwordHash) {
      const ok = currentPassword ? await bcrypt.compare(currentPassword, user.passwordHash) : false;
      if (!ok) {
        res.status(401).json({ error: "Current password is incorrect" });
        return;
      }
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const keep = typeof req.body.refreshToken === "string" ? hashToken(req.body.refreshToken) : null;
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash, passwordResetToken: null, passwordResetExpires: null } }),
      prisma.refreshToken.deleteMany({ where: { userId: user.id, ...(keep ? { token: { not: keep } } : {}) } }),
    ]);
    res.json({ success: true });
  } catch (err) {
    console.error("POST /auth/change-password error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const deleteAccountSchema = z.object({
  confirm: z.literal("DELETE"),
  password: z.string().optional(),
});

// DELETE /auth/account — permanently delete the account and everything it owns.
// Password accounts must re-enter the password; Google-only accounts confirm
// by typing DELETE (they have no password to check).
router.delete("/account", requireAuth, strictLimiter, async (req: AuthRequest, res: Response) => {
  const result = deleteAccountSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Type DELETE to confirm' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (user.passwordHash) {
      const ok = result.data.password ? await bcrypt.compare(result.data.password, user.passwordHash) : false;
      if (!ok) {
        res.status(401).json({ error: "Password is incorrect" });
        return;
      }
    }

    // Rounds are the one relation without ON DELETE CASCADE (their holes,
    // reactions, comments and competition entries do cascade from the round),
    // so they go first; everything else hangs off the user and cascades.
    await prisma.$transaction([
      prisma.round.deleteMany({ where: { userId: user.id } }),
      prisma.user.delete({ where: { id: user.id } }),
    ]);
    // The verified-email cache only ever holds positives; drop this one so a
    // still-unexpired access token can't pass the gate for a deleted user.
    forgetVerifiedEmail(user.id);
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /auth/account error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
