import { Router, Request, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
import prisma from "../lib/prisma";
import { sendVerificationEmail, sendPasswordResetEmail } from "../lib/email";
import { requireAuth, type AuthRequest } from "../middleware/auth";
import { strictLimiter } from "../middleware/rateLimiter";

const googleClient = new OAuth2Client();

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
router.post("/register", strictLimiter, async (req: Request, res: Response) => {
  const result = registerSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.flatten().fieldErrors });
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
router.post("/login", strictLimiter, async (req: Request, res: Response) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.flatten().fieldErrors });
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
router.post("/google", strictLimiter, async (req: Request, res: Response) => {
  const { credential } = req.body;
  if (!credential) {
    res.status(400).json({ error: "Missing credential" });
    return;
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      res.status(401).json({ error: "Invalid Google token" });
      return;
    }

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
    res.status(401).json({ error: "Google authentication failed" });
  }
});

// POST /auth/refresh
router.post("/refresh", strictLimiter, async (req: Request, res: Response) => {
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
    res.status(400).json({ error: result.error.flatten().fieldErrors });
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
    res.status(400).json({ error: result.error.flatten().fieldErrors });
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

export default router;
