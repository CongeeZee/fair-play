import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { calculateDifferentials, calculateHandicapIndex } from "../lib/handicap";

const router = Router();
router.use(requireAuth);

// Helper: get accepted friend IDs for a user (excluding blocked)
async function getAcceptedFriendIds(userId: number): Promise<number[]> {
  const friendships = await prisma.friendship.findMany({
    where: { status: "ACCEPTED", OR: [{ requesterId: userId }, { addresseeId: userId }] },
    select: { requesterId: true, addresseeId: true },
  });
  const friendIds = friendships.map((f) => (f.requesterId === userId ? f.addresseeId : f.requesterId));

  const blocks = await prisma.friendship.findMany({
    where: { status: "BLOCKED", OR: [{ requesterId: userId }, { addresseeId: userId }] },
    select: { requesterId: true, addresseeId: true },
  });
  const blockedIds = new Set(blocks.map((b) => (b.requesterId === userId ? b.addresseeId : b.requesterId)));
  return friendIds.filter((id) => !blockedIds.has(id));
}

// Helper: calculate handicap for a given user
async function getUserHandicap(userId: number): Promise<number | null> {
  const linked = await prisma.linkedHandicap.findUnique({
    where: { userId },
    select: { handicapIndex: true },
  });
  if (linked) return linked.handicapIndex;

  const rounds = await prisma.round.findMany({
    where: { userId },
    include: {
      course: { select: { name: true, courseRating: true, slopeRating: true, _count: { select: { holes: true } } } },
      roundHoles: { select: { strokes: true } },
    },
    orderBy: { playedAt: "desc" },
    take: 20,
  });
  const diffs = calculateDifferentials(rounds);
  const result = calculateHandicapIndex(diffs);
  return result?.handicapIndex ?? null;
}

// Helper: calculate handicap trend for a user
async function getUserHandicapTrend(userId: number): Promise<"improving" | "declining" | "stable" | null> {
  const rounds = await prisma.round.findMany({
    where: { userId },
    include: {
      course: { select: { name: true, courseRating: true, slopeRating: true, _count: { select: { holes: true } } } },
      roundHoles: { select: { strokes: true } },
    },
    orderBy: { playedAt: "asc" },
  });
  const allDiffs = calculateDifferentials(rounds);
  const currentResult = calculateHandicapIndex(allDiffs);
  if (allDiffs.length < 8 || !currentResult) return null;
  const olderDiffs = allDiffs.slice(0, -5);
  const olderResult = calculateHandicapIndex(olderDiffs);
  if (!olderResult) return null;
  const diff = currentResult.handicapIndex - olderResult.handicapIndex;
  if (diff < -0.5) return "improving";
  if (diff > 0.5) return "declining";
  return "stable";
}

// GET /users/:userId/profile
router.get("/:userId/profile", async (req: AuthRequest, res: Response) => {
  try {
    const viewerId = req.userId!;
    const targetId = parseInt(String(req.params.userId), 10);
    if (isNaN(targetId)) { res.status(400).json({ error: "Invalid user ID" }); return; }

    // Access check: must be self or accepted friend
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
      if (!friendship) { res.status(403).json({ error: "You must be friends to view this profile" }); return; }
    }

    const user = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, name: true, createdAt: true },
    });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    // Handicap
    const handicapIndex = await getUserHandicap(targetId);

    // Rounds played (completed)
    const roundsPlayed = await prisma.round.count({
      where: { userId: targetId, completedAt: { not: null } },
    });

    // Average & best score to par (18-hole completed rounds)
    const completedRounds = await prisma.round.findMany({
      where: { userId: targetId, completedAt: { not: null } },
      include: {
        course: { select: { _count: { select: { holes: true } } } },
        roundHoles: { select: { strokes: true, hole: { select: { par: true } } } },
      },
    });

    const fullRounds = completedRounds.filter(
      (r) => r.course._count.holes >= 18 && r.roundHoles.length === r.course._count.holes
    );
    let averageScoreToPar: number | null = null;
    let bestScoreToPar: number | null = null;
    if (fullRounds.length > 0) {
      const scoresToPar = fullRounds.map((r) => {
        const strokes = r.roundHoles.reduce((s, rh) => s + rh.strokes, 0);
        const par = r.roundHoles.reduce((s, rh) => s + rh.hole.par, 0);
        return strokes - par;
      });
      averageScoreToPar = parseFloat((scoresToPar.reduce((s, v) => s + v, 0) / scoresToPar.length).toFixed(1));
      bestScoreToPar = Math.min(...scoresToPar);
    }

    // Favourite course
    const favouriteCourseResult = await prisma.round.groupBy({
      by: ["courseId"],
      where: { userId: targetId, completedAt: { not: null } },
      _count: { courseId: true },
      orderBy: { _count: { courseId: "desc" } },
      take: 1,
    });
    let favouriteCourse: string | null = null;
    if (favouriteCourseResult.length > 0) {
      const course = await prisma.course.findUnique({
        where: { id: favouriteCourseResult[0].courseId },
        select: { name: true },
      });
      favouriteCourse = course?.name ?? null;
    }

    // Recent rounds (last 10 completed)
    const recentRoundsRaw = await prisma.round.findMany({
      where: { userId: targetId, completedAt: { not: null } },
      include: {
        course: { select: { name: true, _count: { select: { holes: true } } } },
        roundHoles: { select: { strokes: true, hole: { select: { par: true } } } },
        _count: { select: { reactions: true } },
      },
      orderBy: { playedAt: "desc" },
      take: 10,
    });
    const recentRounds = recentRoundsRaw.map((r) => {
      const totalStrokes = r.roundHoles.reduce((s, rh) => s + rh.strokes, 0);
      const totalPar = r.roundHoles.reduce((s, rh) => s + rh.hole.par, 0);
      return {
        roundId: r.id,
        shareId: r.shareId,
        courseName: r.course.name,
        playedAt: r.playedAt,
        totalStrokes,
        scoreToPar: totalStrokes - totalPar,
        holesCompleted: r.roundHoles.length,
      };
    });

    // Mutual friends (only relevant when viewing someone else)
    let mutualFriends = 0;
    if (targetId !== viewerId) {
      const [viewerFriends, targetFriends] = await Promise.all([
        getAcceptedFriendIds(viewerId),
        getAcceptedFriendIds(targetId),
      ]);
      const targetSet = new Set(targetFriends);
      mutualFriends = viewerFriends.filter((id) => targetSet.has(id)).length;
    }

    // Is live
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const liveRound = await prisma.round.findFirst({
      where: { userId: targetId, completedAt: null, lastScoredAt: { gte: fourHoursAgo } },
      include: { course: { select: { name: true } } },
    });

    res.json({
      id: user.id,
      name: user.name,
      handicapIndex,
      memberSince: user.createdAt,
      roundsPlayed,
      averageScoreToPar,
      bestScoreToPar,
      favouriteCourse,
      recentRounds,
      achievements: [],
      mutualFriends,
      isLive: !!liveRound,
      liveRoundId: liveRound?.id ?? null,
      liveCourseName: liveRound?.course.name ?? null,
    });
  } catch (err) {
    console.error("GET /users/:userId/profile error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /users/:userId/handicap-history — handicap progression for a user (friend or self)
router.get("/:userId/handicap-history", async (req: AuthRequest, res: Response) => {
  try {
    const viewerId = req.userId!;
    const targetId = parseInt(String(req.params.userId), 10);
    if (isNaN(targetId)) { res.status(400).json({ error: "Invalid user ID" }); return; }

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
      if (!friendship) { res.status(403).json({ error: "Must be friends" }); return; }
    }

    const rounds = await prisma.round.findMany({
      where: { userId: targetId },
      include: {
        course: { select: { name: true, courseRating: true, slopeRating: true, _count: { select: { holes: true } } } },
        roundHoles: { select: { strokes: true } },
      },
      orderBy: { playedAt: "asc" },
    });

    const allDiffs = calculateDifferentials(rounds);
    const history: Array<{ date: string; handicapIndex: number }> = [];
    for (let i = 2; i < allDiffs.length; i++) {
      const subset = allDiffs.slice(0, i + 1);
      const result = calculateHandicapIndex(subset);
      if (result) {
        history.push({ date: allDiffs[i].playedAt.toISOString(), handicapIndex: result.handicapIndex });
      }
    }

    res.json(history);
  } catch (err) {
    console.error("GET /users/:userId/handicap-history error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /users/:userId/head-to-head
router.get("/:userId/head-to-head", async (req: AuthRequest, res: Response) => {
  try {
    const viewerId = req.userId!;
    const targetId = parseInt(String(req.params.userId), 10);
    if (isNaN(targetId) || targetId === viewerId) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }

    // Must be friends
    const friendship = await prisma.friendship.findFirst({
      where: {
        status: "ACCEPTED",
        OR: [
          { requesterId: viewerId, addresseeId: targetId },
          { requesterId: targetId, addresseeId: viewerId },
        ],
      },
    });
    if (!friendship) { res.status(403).json({ error: "You must be friends to view head-to-head" }); return; }

    // Get completed rounds for both users with course info
    const [viewerRounds, targetRounds] = await Promise.all([
      prisma.round.findMany({
        where: { userId: viewerId, completedAt: { not: null } },
        include: {
          course: { select: { id: true, name: true, _count: { select: { holes: true } } } },
          roundHoles: { select: { strokes: true, hole: { select: { par: true } } } },
        },
        orderBy: { playedAt: "desc" },
      }),
      prisma.round.findMany({
        where: { userId: targetId, completedAt: { not: null } },
        include: {
          course: { select: { id: true, name: true, _count: { select: { holes: true } } } },
          roundHoles: { select: { strokes: true, hole: { select: { par: true } } } },
        },
        orderBy: { playedAt: "desc" },
      }),
    ]);

    // Build per-round score-to-par
    const toScoreToPar = (r: typeof viewerRounds[0]) => {
      const strokes = r.roundHoles.reduce((s, rh) => s + rh.strokes, 0);
      const par = r.roundHoles.reduce((s, rh) => s + rh.hole.par, 0);
      return strokes - par;
    };

    // Find shared courses
    const viewerCourseIds = new Set(viewerRounds.map((r) => r.courseId));
    const targetCourseIds = new Set(targetRounds.map((r) => r.courseId));
    const sharedCourseIds = [...viewerCourseIds].filter((id) => targetCourseIds.has(id));

    // Build shared courses stats
    const sharedCourses = sharedCourseIds.map((courseId) => {
      const vRounds = viewerRounds.filter((r) => r.courseId === courseId);
      const tRounds = targetRounds.filter((r) => r.courseId === courseId);
      const vScores = vRounds.map(toScoreToPar);
      const tScores = tRounds.map(toScoreToPar);
      return {
        courseId,
        courseName: vRounds[0].course.name,
        viewerBest: Math.min(...vScores),
        targetBest: Math.min(...tScores),
        viewerAvg: parseFloat((vScores.reduce((s, v) => s + v, 0) / vScores.length).toFixed(1)),
        targetAvg: parseFloat((tScores.reduce((s, v) => s + v, 0) / tScores.length).toFixed(1)),
        viewerRounds: vScores.length,
        targetRounds: tScores.length,
      };
    });

    // Head-to-head: compare best rounds at each shared course
    let viewerWins = 0;
    let targetWins = 0;
    let draws = 0;
    for (const sc of sharedCourses) {
      if (sc.viewerBest < sc.targetBest) viewerWins++;
      else if (sc.targetBest < sc.viewerBest) targetWins++;
      else draws++;
    }

    // Recent matchups: rounds at same course within 30 days of each other
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const recentMatchups: Array<{
      courseName: string;
      viewerScore: number;
      targetScore: number;
      viewerDate: string;
      targetDate: string;
      winner: "viewer" | "target" | "draw";
    }> = [];

    for (const courseId of sharedCourseIds) {
      const vRounds = viewerRounds.filter((r) => r.courseId === courseId);
      const tRounds = targetRounds.filter((r) => r.courseId === courseId);
      for (const vr of vRounds) {
        for (const tr of tRounds) {
          const timeDiff = Math.abs(new Date(vr.playedAt).getTime() - new Date(tr.playedAt).getTime());
          if (timeDiff <= thirtyDaysMs) {
            const vScore = toScoreToPar(vr);
            const tScore = toScoreToPar(tr);
            recentMatchups.push({
              courseName: vr.course.name,
              viewerScore: vScore,
              targetScore: tScore,
              viewerDate: vr.playedAt.toISOString(),
              targetDate: tr.playedAt.toISOString(),
              winner: vScore < tScore ? "viewer" : tScore < vScore ? "target" : "draw",
            });
          }
        }
      }
    }
    // Sort by most recent viewer date, take last 5
    recentMatchups.sort((a, b) => new Date(b.viewerDate).getTime() - new Date(a.viewerDate).getTime());
    const topMatchups = recentMatchups.slice(0, 5);

    // Handicap comparison
    const [viewerHandicap, targetHandicap, viewerTrend, targetTrend] = await Promise.all([
      getUserHandicap(viewerId),
      getUserHandicap(targetId),
      getUserHandicapTrend(viewerId),
      getUserHandicapTrend(targetId),
    ]);

    res.json({
      totalRoundsCompared: sharedCourseIds.length,
      viewerWins,
      targetWins,
      draws,
      sharedCourses,
      handicapComparison: {
        viewerCurrent: viewerHandicap,
        targetCurrent: targetHandicap,
        viewerTrend,
        targetTrend,
      },
      recentMatchups: topMatchups,
    });
  } catch (err) {
    console.error("GET /users/:userId/head-to-head error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
