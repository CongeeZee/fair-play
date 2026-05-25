import { Router, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { sendPushToUser } from "../lib/pushNotification";

const router = Router();

const ALLOWED_EMOJI = ["\u{1F525}", "\u{1F44F}", "\u{1F602}", "\u{1F480}", "\u26F3"] as const;
type AllowedEmoji = (typeof ALLOWED_EMOJI)[number];

function isAllowedEmoji(s: string): s is AllowedEmoji {
  return (ALLOWED_EMOJI as readonly string[]).includes(s);
}

router.use(requireAuth);

// Middleware: require email verification
router.use(async (req: AuthRequest, res: Response, next) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { emailVerified: true },
  });
  if (!user?.emailVerified) {
    res.status(403).json({ error: "Verify your email first" });
    return;
  }
  next();
});

// Helper: check if userId is friend of or is targetUserId
async function isFriendOrSelf(userId: number, targetUserId: number): Promise<boolean> {
  if (userId === targetUserId) return true;
  const friendship = await prisma.friendship.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: userId, addresseeId: targetUserId },
        { requesterId: targetUserId, addresseeId: userId },
      ],
    },
  });
  return !!friendship;
}

// Helper: get reaction summary for a round
async function getReactionSummary(roundId: number, userId: number) {
  const reactions = await prisma.roundReaction.findMany({
    where: { roundId },
    select: { emoji: true, userId: true, user: { select: { name: true } } },
  });

  const summary: Record<string, number> = {};
  const names: Record<string, string[]> = {};
  let userReaction: string | null = null;
  for (const r of reactions) {
    summary[r.emoji] = (summary[r.emoji] || 0) + 1;
    if (!names[r.emoji]) names[r.emoji] = [];
    names[r.emoji].push(r.user.name);
    if (r.userId === userId) userReaction = r.emoji;
  }

  return { summary, userReaction, names };
}

// POST /rounds/:roundId/react — toggle a reaction
router.post("/rounds/:roundId/react", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const roundId = parseInt(String(req.params.roundId), 10);
    if (isNaN(roundId)) { res.status(400).json({ error: "Invalid round ID" }); return; }

    const schema = z.object({ emoji: z.string() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "emoji is required" }); return; }

    const { emoji } = parsed.data;
    if (!isAllowedEmoji(emoji)) { res.status(400).json({ error: "Invalid emoji" }); return; }

    const round = await prisma.round.findUnique({
      where: { id: roundId },
      select: { userId: true, course: { select: { name: true } } },
    });
    if (!round) { res.status(404).json({ error: "Round not found" }); return; }

    if (!(await isFriendOrSelf(userId, round.userId))) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }

    const existing = await prisma.roundReaction.findUnique({
      where: { roundId_userId: { roundId, userId } },
    });

    if (existing) {
      if (existing.emoji === emoji) {
        // Toggle off
        await prisma.roundReaction.delete({ where: { id: existing.id } });
      } else {
        // Update to new emoji
        await prisma.roundReaction.update({
          where: { id: existing.id },
          data: { emoji },
        });
      }
    } else {
      // Create new reaction
      await prisma.roundReaction.create({
        data: { roundId, userId, emoji },
      });

      // Push notification to round owner (not self)
      if (userId !== round.userId) {
        const reactor = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
        if (reactor) {
          sendPushToUser(
            round.userId,
            "Fairplay",
            `${reactor.name} reacted ${emoji} to your round at ${round.course.name}`,
            `/feed`
          );
        }
      }
    }

    const result = await getReactionSummary(roundId, userId);
    res.json(result);
  } catch (err) {
    console.error("POST /rounds/:roundId/react error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /rounds/:roundId/reactions — get reactions on a round
router.get("/rounds/:roundId/reactions", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const roundId = parseInt(String(req.params.roundId), 10);
    if (isNaN(roundId)) { res.status(400).json({ error: "Invalid round ID" }); return; }

    const result = await getReactionSummary(roundId, userId);
    res.json(result);
  } catch (err) {
    console.error("GET /rounds/:roundId/reactions error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /rounds/:roundId/comments — add a comment
router.post("/rounds/:roundId/comments", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const roundId = parseInt(String(req.params.roundId), 10);
    if (isNaN(roundId)) { res.status(400).json({ error: "Invalid round ID" }); return; }

    const schema = z.object({ text: z.string().min(1).max(280) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "text is required (1-280 chars)" }); return; }

    const text = parsed.data.text.trim();
    if (!text) { res.status(400).json({ error: "Comment cannot be empty" }); return; }

    const round = await prisma.round.findUnique({
      where: { id: roundId },
      select: { userId: true, course: { select: { name: true } } },
    });
    if (!round) { res.status(404).json({ error: "Round not found" }); return; }

    if (!(await isFriendOrSelf(userId, round.userId))) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }

    const comment = await prisma.roundComment.create({
      data: { roundId, userId, text },
      include: { user: { select: { name: true } } },
    });

    // Push notification to round owner (not self)
    if (userId !== round.userId) {
      const truncated = text.length > 60 ? text.slice(0, 57) + "..." : text;
      sendPushToUser(
        round.userId,
        "Fairplay",
        `${comment.user.name} commented on your round: '${truncated}'`,
        `/feed`
      );
    }

    res.status(201).json({
      id: comment.id,
      userName: comment.user.name,
      userId: comment.userId,
      text: comment.text,
      createdAt: comment.createdAt,
    });
  } catch (err) {
    console.error("POST /rounds/:roundId/comments error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /rounds/:roundId/comments — get all comments on a round
router.get("/rounds/:roundId/comments", async (req: AuthRequest, res: Response) => {
  try {
    const roundId = parseInt(String(req.params.roundId), 10);
    if (isNaN(roundId)) { res.status(400).json({ error: "Invalid round ID" }); return; }

    const comments = await prisma.roundComment.findMany({
      where: { roundId },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
      take: 100,
    });

    res.json(
      comments.map((c) => ({
        id: c.id,
        userName: c.user.name,
        userId: c.userId,
        text: c.text,
        createdAt: c.createdAt,
      }))
    );
  } catch (err) {
    console.error("GET /rounds/:roundId/comments error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /rounds/:roundId/comments/:commentId — delete a comment
router.delete("/rounds/:roundId/comments/:commentId", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const roundId = parseInt(String(req.params.roundId), 10);
    const commentId = String(req.params.commentId);
    if (isNaN(roundId)) { res.status(400).json({ error: "Invalid round ID" }); return; }

    const comment = await prisma.roundComment.findUnique({
      where: { id: commentId },
      select: { userId: true, roundId: true },
    });
    if (!comment || comment.roundId !== roundId) {
      res.status(404).json({ error: "Comment not found" });
      return;
    }

    // Only comment author or round owner can delete
    const round = await prisma.round.findUnique({
      where: { id: roundId },
      select: { userId: true },
    });

    if (comment.userId !== userId && round?.userId !== userId) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }

    await prisma.roundComment.delete({ where: { id: commentId } });
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /rounds/:roundId/comments/:commentId error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
