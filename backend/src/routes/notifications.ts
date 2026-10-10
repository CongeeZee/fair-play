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

// ── In-app inbox ─────────────────────────────────────────────────────────────

// GET /notifications — newest 50, plus the unread count for the bell badge
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        include: { actor: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    res.json({
      unreadCount,
      items: items.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        url: n.url,
        read: n.readAt != null,
        createdAt: n.createdAt,
        actor: n.actor,
      })),
    });
  } catch (err) {
    console.error("GET /notifications error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /notifications/unread-count — cheap poll for the badge
router.get("/unread-count", async (req: AuthRequest, res: Response) => {
  try {
    const unreadCount = await prisma.notification.count({ where: { userId: req.userId!, readAt: null } });
    res.json({ unreadCount });
  } catch (err) {
    console.error("GET /notifications/unread-count error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const readSchema = z.object({ ids: z.array(z.string()).max(100).optional() });

// POST /notifications/read — mark some (ids) or all of the user's notifications read
router.post("/read", async (req: AuthRequest, res: Response) => {
  const parsed = readSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  try {
    const { count } = await prisma.notification.updateMany({
      where: {
        userId: req.userId!,
        readAt: null,
        ...(parsed.data.ids ? { id: { in: parsed.data.ids } } : {}),
      },
      data: { readAt: new Date() },
    });
    res.json({ updated: count });
  } catch (err) {
    console.error("POST /notifications/read error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
