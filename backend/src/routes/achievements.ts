import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { ACHIEVEMENTS, evaluateAchievements, getAchievementDef } from "../lib/achievements";

const router = Router();
router.use(requireAuth);

// GET /users/:userId/achievements
router.get("/users/:userId/achievements", async (req: AuthRequest, res: Response) => {
  try {
    const viewerId = req.userId!;
    const targetId = parseInt(String(req.params.userId), 10);
    if (isNaN(targetId)) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }

    // Access check: self or accepted friend
    if (targetId !== viewerId) {
      const friendship = await prisma.friendship.findFirst({
        where: {
          status: "ACCEPTED",
          OR: [
            { requesterId: viewerId, addresseeId: targetId },
            { requesterId: targetId, addresseeId: viewerId },
          ],
        },
      });
      if (!friendship) {
        res.status(403).json({ error: "You must be friends to view this profile" });
        return;
      }
    }

    // Re-evaluate only for the viewer themselves (retroactive unlocks)
    if (targetId === viewerId) {
      await evaluateAchievements(viewerId);
    }

    const records = await prisma.achievement.findMany({
      where: { userId: targetId },
      include: { round: { select: { course: { select: { name: true } } } } },
      orderBy: { unlockedAt: "desc" },
    });

    const unlockedByType = new Map(records.map((r) => [r.type, r]));

    const unlocked = records.map((r) => {
      const def = getAchievementDef(r.type);
      return {
        type: r.type,
        name: def?.name ?? r.type,
        description: def?.description ?? "",
        emoji: def?.emoji ?? "🏆",
        category: def?.category ?? "MILESTONE",
        unlockedAt: r.unlockedAt,
        courseName: r.round?.course.name ?? null,
        metadata: r.metadata,
      };
    });

    const locked = ACHIEVEMENTS
      .filter((def) => !unlockedByType.has(def.type))
      .map((def) => ({
        type: def.type,
        name: def.name,
        description: def.description,
        emoji: def.emoji,
        category: def.category,
      }));

    res.json({ unlocked, locked });
  } catch (err) {
    console.error("GET /users/:userId/achievements error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /achievements/recent — recently unlocked achievements from friends (last 7 days)
router.get("/achievements/recent", async (req: AuthRequest, res: Response) => {
  try {
    const viewerId = req.userId!;

    const friendships = await prisma.friendship.findMany({
      where: { status: "ACCEPTED", OR: [{ requesterId: viewerId }, { addresseeId: viewerId }] },
      select: { requesterId: true, addresseeId: true },
    });
    const friendIds = friendships.map((f) => (f.requesterId === viewerId ? f.addresseeId : f.requesterId));
    if (friendIds.length === 0) {
      res.json([]);
      return;
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const records = await prisma.achievement.findMany({
      where: { userId: { in: friendIds }, unlockedAt: { gte: sevenDaysAgo } },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { unlockedAt: "desc" },
    });

    const result = records.map((r) => {
      const def = getAchievementDef(r.type);
      return {
        id: r.id,
        userId: r.user.id,
        userName: r.user.name,
        type: r.type,
        name: def?.name ?? r.type,
        description: def?.description ?? "",
        emoji: def?.emoji ?? "🏆",
        unlockedAt: r.unlockedAt,
        metadata: r.metadata,
      };
    });

    res.json(result);
  } catch (err) {
    console.error("GET /achievements/recent error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
