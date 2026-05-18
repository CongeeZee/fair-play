import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();

// GET /notifications/vapid-key — public, no auth
router.get("/vapid-key", (_req: Request, res: Response) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    res.status(503).json({ error: "Push notifications not configured" });
    return;
  }
  res.json({ publicKey });
});

// All remaining routes require auth
router.use(requireAuth);

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

// POST /notifications/subscribe — register push subscription
router.post("/subscribe", async (req: AuthRequest, res: Response) => {
  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid subscription data" });
    return;
  }

  const { endpoint, keys } = parsed.data;

  try {
    await prisma.pushSubscription.upsert({
      where: {
        userId_endpoint: { userId: req.userId!, endpoint },
      },
      update: { p256dh: keys.p256dh, auth: keys.auth },
      create: {
        userId: req.userId!,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("POST /notifications/subscribe error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const unsubscribeSchema = z.object({ endpoint: z.string().url() });

// DELETE /notifications/subscribe — remove push subscription
router.delete("/subscribe", async (req: AuthRequest, res: Response) => {
  const parsed = unsubscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid endpoint" });
    return;
  }

  try {
    await prisma.pushSubscription.deleteMany({
      where: { userId: req.userId!, endpoint: parsed.data.endpoint },
    });
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /notifications/subscribe error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
