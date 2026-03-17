import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import prisma from "../lib/prisma";

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function signToken(userId: number): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is not set");
  // 7-day expiry is fine for MVP; production should use short-lived tokens + refresh
  return jwt.sign({ userId }, secret, { expiresIn: "7d" });
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
      // Never return passwordHash to the client
      select: { id: true, email: true, name: true, createdAt: true },
    });

    res.status(201).json({ user, token: signToken(user.id) });
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

    // Always run bcrypt.compare even when user is null — this prevents a
    // timing attack that would reveal whether an email address is registered
    const dummyHash =
      "$2b$12$invalidhashfortimingprotectionxxxxxxxxxxxxxxxxxxxxxxxx";
    const valid = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);

    if (!user || !valid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    res.json({
      user: { id: user.id, email: user.email, name: user.name },
      token: signToken(user.id),
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
