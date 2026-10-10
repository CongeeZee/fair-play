import { Router, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { requireVerifiedEmail } from "../middleware/requireVerifiedEmail";
import { calculateDifferentials, calculateHandicapIndex } from "../lib/handicap";
import { notifyUser } from "../lib/notify";

const router = Router();

router.use(requireAuth);

router.use(requireVerifiedEmail("Verify your email to use social features"));

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

    // For friends without linked handicap, calculate from rounds (parallel)
    const missingIds = friendIds.filter((id) => !handicapMap.has(id));
    if (missingIds.length > 0) {
      const calculated = await Promise.all(
        missingIds.map(async (friendId) => {
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
          return { friendId, index: result?.handicapIndex ?? null };
        })
      );
      for (const { friendId, index } of calculated) {
        if (index != null) handicapMap.set(friendId, index);
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
  const me = req.userId!;

  try {
    // An address matches only exactly — enough to find someone whose email you
    // already know, without turning search into a way to enumerate accounts.
    const byEmail = q.includes("@");
    const users = await prisma.user.findMany({
      where: {
        emailVerified: true,
        id: { not: me },
        ...(byEmail
          ? { email: { equals: q, mode: "insensitive" as const } }
          : { name: { contains: q, mode: "insensitive" as const } }),
        // Someone who blocked you (or whom you blocked) doesn't turn up
        NOT: {
          OR: [
            { sentRequests: { some: { addresseeId: me, status: "BLOCKED" } } },
            { receivedRequests: { some: { requesterId: me, status: "BLOCKED" } } },
          ],
        },
      },
      select: { id: true, name: true },
      take: 20,
    });

    const userIds = users.map((u) => u.id);
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: me, addresseeId: { in: userIds } },
          { requesterId: { in: userIds }, addresseeId: me },
        ],
      },
    });
    const rel = new Map(friendships.map((f) => [f.requesterId === me ? f.addresseeId : f.requesterId, f]));

    // Names that start with the query first, then alphabetical
    const lower = q.toLowerCase();
    users.sort((a, b) => {
      const as = a.name.toLowerCase().startsWith(lower) ? 0 : 1;
      const bs = b.name.toLowerCase().startsWith(lower) ? 0 : 1;
      return as - bs || a.name.localeCompare(b.name);
    });

    res.json(
      users.map((u) => {
        const f = rel.get(u.id);
        const pending = f?.status === "PENDING";
        return {
          id: u.id,
          name: u.name,
          isFriend: f?.status === "ACCEPTED",
          // Only requests *you* sent read as pending; one they sent you can be
          // accepted straight from the result.
          isPending: pending && f!.requesterId === me,
          incomingRequestId: pending && f!.requesterId !== me ? f!.id : null,
        };
      })
    );
  } catch (err) {
    console.error("GET /friends/search error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /friends/suggestions — people you may know: friends of your friends and
// people who've tagged you in a round, ranked by how many links you share.
router.get("/suggestions", async (req: AuthRequest, res: Response) => {
  const me = req.userId!;
  try {
    const [mine, tagged] = await Promise.all([
      prisma.friendship.findMany({
        where: { OR: [{ requesterId: me }, { addresseeId: me }] },
        select: { requesterId: true, addresseeId: true, status: true },
      }),
      prisma.roundPartner.findMany({
        where: { OR: [{ userId: me }, { round: { userId: me } }] },
        select: { userId: true, round: { select: { userId: true } } },
        take: 200,
      }),
    ]);
    const other = (f: { requesterId: number; addresseeId: number }) => (f.requesterId === me ? f.addresseeId : f.requesterId);
    const friendIds = mine.filter((f) => f.status === "ACCEPTED").map(other);
    // Anyone you already have any relationship with — friend, pending either
    // way, or blocked either way — is not a suggestion.
    const exclude = new Set<number>([me, ...mine.map(other)]);

    const score = new Map<number, { mutual: number; playedWith: boolean }>();
    const bump = (id: number, kind: "mutual" | "played") => {
      if (exclude.has(id)) return;
      const e = score.get(id) ?? { mutual: 0, playedWith: false };
      if (kind === "mutual") e.mutual++;
      else e.playedWith = true;
      score.set(id, e);
    };

    if (friendIds.length > 0) {
      const fof = await prisma.friendship.findMany({
        where: {
          status: "ACCEPTED",
          OR: [{ requesterId: { in: friendIds } }, { addresseeId: { in: friendIds } }],
        },
        select: { requesterId: true, addresseeId: true },
        take: 2000,
      });
      const friendSet = new Set(friendIds);
      for (const f of fof) {
        // Each edge from a friend to someone else is one mutual connection
        if (friendSet.has(f.requesterId)) bump(f.addresseeId, "mutual");
        if (friendSet.has(f.addresseeId)) bump(f.requesterId, "mutual");
      }
    }
    for (const t of tagged) bump(t.userId === me ? t.round.userId : t.userId, "played");

    const ranked = [...score.entries()]
      .sort((a, b) => Number(b[1].playedWith) - Number(a[1].playedWith) || b[1].mutual - a[1].mutual)
      .slice(0, 10);
    if (ranked.length === 0) {
      res.json([]);
      return;
    }

    const users = await prisma.user.findMany({
      where: { id: { in: ranked.map(([id]) => id) }, emailVerified: true },
      select: { id: true, name: true },
    });
    const names = new Map(users.map((u) => [u.id, u.name]));
    res.json(
      ranked
        .filter(([id]) => names.has(id))
        .map(([id, s]) => ({ id, name: names.get(id)!, mutualFriends: s.mutual, playedWith: s.playedWith })),
    );
  } catch (err) {
    console.error("GET /friends/suggestions error:", err);
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
      notifyUser(addresseeId, {
        type: "friend_request",
        title: "New friend request",
        body: `${sender.name} wants to be your friend`,
        url: "/friends?tab=requests",
        actorId: req.userId!,
      }).catch(() => {});
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

    prisma.user
      .findUnique({ where: { id: req.userId! }, select: { name: true } })
      .then((me) => {
        if (!me) return;
        return notifyUser(friendship.requesterId, {
          type: "friend_accepted",
          title: "Friend request accepted",
          body: `${me.name} accepted your friend request`,
          url: `/profile/${req.userId!}`,
          actorId: req.userId!,
        });
      })
      .catch(() => {});

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
