import { Router, Request, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
import prisma from "../lib/prisma";

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
}

async function issueTokens(user: AuthUser, res: Response, status = 200) {
  const accessToken = signAccessToken(user.id);
  const refreshToken = await createRefreshToken(user.id);

  res.status(status).json({
    user: { id: user.id, email: user.email, name: user.name },
    token: accessToken,
    refreshToken,
  });
}

// POST /auth/register
router.post("/register", async (req: Request, res: Response) => {
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
    const user = await prisma.user.create({
      data: { email, passwordHash, name },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    await issueTokens(user, res, 201);
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /auth/login
router.post("/login", async (req: Request, res: Response) => {
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
    const valid = await bcrypt.compare(password, user?.passwordHash || dummyHash);

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
router.post("/google", async (req: Request, res: Response) => {
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
      if (!user.googleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId },
        });
      }
    } else {
      user = await prisma.user.create({
        data: { email, name: name || email.split("@")[0], googleId },
      });
    }

    await issueTokens(user, res);
  } catch (err) {
    console.error("Google auth error:", err);
    res.status(401).json({ error: "Google authentication failed" });
  }
});

// POST /auth/refresh — exchange refresh token for new access + refresh tokens
router.post("/refresh", async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(400).json({ error: "Missing refresh token" });
    return;
  }

  try {
    const hashed = hashToken(refreshToken);
    const stored = await prisma.refreshToken.findUnique({
      where: { token: hashed },
      include: { user: { select: { id: true, email: true, name: true } } },
    });

    if (!stored) {
      res.status(401).json({ error: "Invalid refresh token" });
      return;
    }

    // Delete the used token (rotation)
    await prisma.refreshToken.delete({ where: { id: stored.id } });

    if (stored.expiresAt < new Date()) {
      res.status(401).json({ error: "Refresh token expired" });
      return;
    }

    // Issue new pair
    await issueTokens(stored.user, res);
  } catch (err) {
    console.error("Refresh error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /auth/logout — invalidate refresh token
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
    // Silently ignore — token may already be gone
  }

  res.json({ ok: true });
});

export default router;
