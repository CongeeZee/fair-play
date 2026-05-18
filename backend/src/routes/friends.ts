import { Router, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { calculateDifferentials, calculateHandicapIndex } from "../lib/handicap";
import { sendPushToUser } from "../lib/pushNotification";

const router = Router();

router.use(requireAuth);

// Middleware: require email verification for all friend routes
router.use(async (req: AuthRequest, res: Response, next) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { emailVerified: true },
  });
  if (!user?.emailVerified) {
    res.status(403).json({ error: "Verify your email to use social features" });
    return;
  }
  next();
});

// GET /friends — list accepted friends
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const friendships = await prisma.friendship.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ requesterId: req.userId! }, { addresseeId: req.userId! }],
      },
      include: {
        requester: { select: { id: true, name: true } },
        addressee: { select: { id: true, name: true } },
      },
    });

    const friendIds = friendships.map((f) =>
      f.requesterId === req.userId! ? f.addresseeId : f.requesterId
    );

    // Batch-fetch handicaps for all friends
    const handicaps = await prisma.linkedHandicap.findMany({
      where: { userId: { in: friendIds } },
      select: { userId: true, handicapIndex: true },
    });
    const handicapMap = new Map(handicaps.map((h) => [h.userId, h.handicapIndex]));

    // For friends without linked handicap, calculate from rounds
    const missingIds = friendIds.filter((id) => !handicapMap.has(id));
    if (missingIds.length > 0) {
      for (const friendId of missingIds) {
        const rounds = await prisma.round.findMany({
          where: { userId: friendId },
          include: {
            course: {
              select: {
                name: true,
                courseRating: true,
                slopeRating: true,
                _count: { select: { holes: true } },
              },
            },
            roundHoles: { select: { strokes: true } },
          },
          orderBy: { playedAt: "desc" },
          take: 20,
        });
        const diffs = calculateDifferentials(rounds);
        const result = calculateHandicapIndex(diffs);
        if (result) handicapMap.set(friendId, result.handicapIndex);
      }
    }

    const friends = friendships.map((f) => {
      const friend =
        f.requesterId === req.userId! ? f.addressee : f.requester;
      return {
        id: friend.id,
        friendshipId: f.id,
        name: friend.name,
        handicapIndex: handicapMap.get(friend.id) ?? null,
      };
    });

    res.json(friends);
  } catch (err) {
    console.error("GET /friends error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /friends/requests — pending incoming requests
router.get("/requests", async (req: AuthRequest, res: Response) => {
  try {
    const requests = await prisma.friendship.findMany({
      where: { addresseeId: req.userId!, status: "PENDING" },
      include: { requester: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });

    res.json(
      requests.map((r) => ({
        friendshipId: r.id,
        from: { id: r.requester.id, name: r.requester.name },
        sentAt: r.createdAt,
      }))
    );
  } catch (err) {
    console.error("GET /friends/requests error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /friends/search?q= — search users by name
router.get("/search", async (req: AuthRequest, res: Response) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 2) {
    res.json([]);
    return;
  }

  try {
    const users = await prisma.user.findMany({
      where: {
        emailVerified: true,
        id: { not: req.userId! },
        name: { contains: q, mode: "insensitive" },
      },
      select: { id: true, name: true },
      take: 20,
    });

    // Get all friendships between current user and found users
    const userIds = users.map((u) => u.id);
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: req.userId!, addresseeId: { in: userIds } },
          { requesterId: { in: userIds }, addresseeId: req.userId! },
        ],
      },
    });

    const friendshipMap = new Map<
      number,
      { status: string; requesterId: number }
    >();
    for (const f of friendships) {
      const otherId =
        f.requesterId === req.userId! ? f.addresseeId : f.requesterId;
      friendshipMap.set(otherId, {
        status: f.status,
        requesterId: f.requesterId,
      });
    }

    res.json(
      users.map((u) => {
        const rel = friendshipMap.get(u.id);
        return {
          id: u.id,
          name: u.name,
          isFriend: rel?.status === "ACCEPTED",
          isPending: rel?.status === "PENDING",
          isBlocked:
            rel?.status === "BLOCKED" && rel.requesterId === req.userId!,
        };
      })
    );
  } catch (err) {
    console.error("GET /friends/search error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /friends/request — send a friend request
const requestSchema = z.object({ addresseeId: z.number() });

router.post("/request", async (req: AuthRequest, res: Response) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "addresseeId is required (number)" });
    return;
  }

  const { addresseeId } = parsed.data;

  if (addresseeId === req.userId!) {
    res.status(400).json({ error: "You can't send a friend request to yourself" });
    return;
  }

  try {
    // Check addressee exists
    const addressee = await prisma.user.findUnique({
      where: { id: addresseeId },
      select: { id: true },
    });
    if (!addressee) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Check for existing friendship in either direction
    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: req.userId!, addresseeId },
          { requesterId: addresseeId, addresseeId: req.userId! },
        ],
      },
    });

    if (existing) {
      if (existing.status === "BLOCKED") {
        res.status(403).json({ error: "Unable to send friend request" });
        return;
      }
      if (existing.status === "ACCEPTED") {
        res.status(409).json({ error: "You are already friends" });
        return;
      }
      if (existing.status === "PENDING") {
        if (existing.requesterId === addresseeId) {
          res.status(409).json({
            error: "This user already sent you a request. Accept it instead.",
            friendshipId: existing.id,
          });
        } else {
          res.status(409).json({ error: "Friend request already sent" });
        }
        return;
      }
    }

    const friendship = await prisma.friendship.create({
      data: { requesterId: req.userId!, addresseeId },
    });

    // Send push notification to the addressee (fire-and-forget)
    const sender = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { name: true },
    });
    if (sender) {
      sendPushToUser(
        addresseeId,
        "New friend request",
        `${sender.name} wants to be your friend`,
        "/friends"
      ).catch(() => {});
    }

    res.status(201).json({ friendshipId: friendship.id });
  } catch (err) {
    console.error("POST /friends/request error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /friends/accept/:friendshipId
router.post("/accept/:friendshipId", async (req: AuthRequest, res: Response) => {
  try {
    const friendship = await prisma.friendship.findUnique({
      where: { id: String(req.params.friendshipId) },
    });

    if (!friendship || friendship.status !== "PENDING") {
      res.status(404).json({ error: "Pending request not found" });
      return;
    }

    if (friendship.addresseeId !== req.userId!) {
      res.status(403).json({ error: "Only the recipient can accept" });
      return;
    }

    await prisma.friendship.update({
      where: { id: friendship.id },
      data: { status: "ACCEPTED" },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("POST /friends/accept error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /friends/decline/:friendshipId
router.post("/decline/:friendshipId", async (req: AuthRequest, res: Response) => {
  try {
    const friendship = await prisma.friendship.findUnique({
      where: { id: String(req.params.friendshipId) },
    });

    if (!friendship || friendship.status !== "PENDING") {
      res.status(404).json({ error: "Pending request not found" });
      return;
    }

    if (friendship.addresseeId !== req.userId!) {
      res.status(403).json({ error: "Only the recipient can decline" });
      return;
    }

    await prisma.friendship.delete({ where: { id: friendship.id } });

    res.json({ success: true });
  } catch (err) {
    console.error("POST /friends/decline error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /friends/:friendshipId — remove a friend
router.delete("/:friendshipId", async (req: AuthRequest, res: Response) => {
  try {
    const friendship = await prisma.friendship.findUnique({
      where: { id: String(req.params.friendshipId) },
    });

    if (!friendship || friendship.status !== "ACCEPTED") {
      res.status(404).json({ error: "Friendship not found" });
      return;
    }

    if (
      friendship.requesterId !== req.userId! &&
      friendship.addresseeId !== req.userId!
    ) {
      res.status(403).json({ error: "Not your friendship" });
      return;
    }

    await prisma.friendship.delete({ where: { id: friendship.id } });

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /friends error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /friends/block/:userId
router.post("/block/:userId", async (req: AuthRequest, res: Response) => {
  const targetId = parseInt(String(req.params.userId), 10);
  if (isNaN(targetId) || targetId === req.userId!) {
    res.status(400).json({ error: "Invalid user" });
    return;
  }

  try {
    // Find existing friendship in either direction
    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: req.userId!, addresseeId: targetId },
          { requesterId: targetId, addresseeId: req.userId! },
        ],
      },
    });

    if (existing) {
      // If already blocked by us, no-op
      if (
        existing.status === "BLOCKED" &&
        existing.requesterId === req.userId!
      ) {
        res.json({ success: true });
        return;
      }
      // Delete existing and create new block (requester = blocker)
      await prisma.friendship.delete({ where: { id: existing.id } });
    }

    await prisma.friendship.create({
      data: {
        requesterId: req.userId!,
        addresseeId: targetId,
        status: "BLOCKED",
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("POST /friends/block error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /friends/block/:userId — unblock
router.delete("/block/:userId", async (req: AuthRequest, res: Response) => {
  const targetId = parseInt(String(req.params.userId), 10);
  if (isNaN(targetId)) {
    res.status(400).json({ error: "Invalid user" });
    return;
  }

  try {
    const blocked = await prisma.friendship.findFirst({
      where: {
        requesterId: req.userId!,
        addresseeId: targetId,
        status: "BLOCKED",
      },
    });

    if (!blocked) {
      res.status(404).json({ error: "Block not found" });
      return;
    }

    await prisma.friendship.delete({ where: { id: blocked.id } });

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /friends/block error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
