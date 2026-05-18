import { Router, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

// ── Link/Unlink endpoints ───────────────────────────────────────────────────

const linkSchema = z.object({
  source: z.enum(["manual"]),
  externalId: z.string().optional(),
  handicapIndex: z.number().min(-10).max(54),
  playerName: z.string().optional(),
  clubName: z.string().optional(),
});

// POST /handicap/link — save linked handicap to user profile
router.post("/link", async (req: AuthRequest, res: Response) => {
  const parsed = linkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  const { source, externalId, handicapIndex, playerName, clubName } = parsed.data;

  try {
    const linked = await prisma.linkedHandicap.upsert({
      where: { userId: req.userId! },
      update: {
        source,
        externalId: externalId || null,
        handicapIndex,
        playerName: playerName || null,
        clubName: clubName || null,
        lastSynced: new Date(),
      },
      create: {
        userId: req.userId!,
        source,
        externalId: externalId || null,
        handicapIndex,
        playerName: playerName || null,
        clubName: clubName || null,
      },
    });

    res.json(linked);
  } catch (err) {
    console.error("POST /handicap/link error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /handicap/linked — get current linked handicap
router.get("/linked", async (req: AuthRequest, res: Response) => {
  try {
    const linked = await prisma.linkedHandicap.findUnique({
      where: { userId: req.userId! },
    });
    res.json(linked);
  } catch (err) {
    console.error("GET /handicap/linked error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /handicap/link — unlink handicap
router.delete("/link", async (req: AuthRequest, res: Response) => {
  try {
    await prisma.linkedHandicap.deleteMany({
      where: { userId: req.userId! },
    });
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /handicap/link error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
