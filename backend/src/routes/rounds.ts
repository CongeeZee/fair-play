import { Router, Response } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import prisma from "../lib/prisma";
import { sendValidationError } from "../lib/validation";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { requireFeature } from "../middleware/entitlement";
import { calculateDifferentials, calculateHandicapIndex } from "../lib/handicap";
import { getUserHandicapIndex } from "../lib/userHandicap";
import { allocateStrokesReceived, courseHandicapFrom } from "../lib/stableford";
import {
  bandForHandicap,
  computeRoundStrokesGained,
  MIN_TRACKED_HOLES,
  SG_CATEGORIES,
  SGCategory,
} from "../lib/strokesGained";
import {
  TREND_METRICS,
  TREND_METRIC_CONFIG,
  roundMetricValue,
  rollingAverage,
  computeTrendDelta,
  roundScoreToPar,
  holeBreakdown,
  summarisePutting,
  summariseApproach,
  summariseTeeShots,
  summarisePuttingByGir,
  summarisePenalties,
} from "../lib/roundMetrics";
import {
  ALL_BAND,
  BENCHMARK_METRICS,
  BENCHMARK_METRIC_CONFIG,
  BENCHMARK_ROUND_WINDOW,
  BenchmarkMetric,
  SnapshotSummary,
  bandKeyForIndex,
  bandLabel,
  betterThanPercentile,
  chooseCohort,
  ensureFreshSnapshots,
  userMetricValues,
} from "../lib/benchmarks";
import { sendPushToUser } from "../lib/pushNotification";
import { evaluateAchievements, getAchievementDef } from "../lib/achievements";

const router = Router();

// ── Public endpoints (no auth) ────────────────────────────────────────────────

// GET /rounds/shared/:shareId — public scorecard view
router.get("/shared/:shareId", async (req, res: Response) => {
  const shareId = String(req.params.shareId);

  try {
    const round = await prisma.round.findUnique({
      where: { shareId },
      include: {
        user: { select: { name: true } },
        course: {
          select: {
            name: true,
            courseRating: true,
            slopeRating: true,
            holes: { orderBy: { number: "asc" }, select: { number: true, par: true, distance: true } },
          },
        },
        roundHoles: {
          include: { hole: { select: { number: true, par: true } } },
          orderBy: { hole: { number: "asc" } },
        },
      },
    });

    if (!round) {
      res.status(404).json({ error: "Scorecard not found" });
      return;
    }

    const totalHoles = round.course.holes.length;
    const holesScored = round.roundHoles.length;
    const inProgress = holesScored < totalHoles;

    const holes = round.course.holes.map((hole) => {
      const rh = round.roundHoles.find((rh) => rh.hole.number === hole.number);
      return {
        number: hole.number,
        par: hole.par,
        distance: hole.distance,
        strokes: rh?.strokes ?? null,
        putts: rh?.putts ?? null,
        scoreToPar: rh ? rh.strokes - hole.par : null,
      };
    });

    const frontNine = holes.slice(0, 9);
    const backNine = holes.slice(9);

    const sum = (arr: typeof holes, key: "strokes" | "par") =>
      arr.reduce((s, h) => s + (key === "par" ? h.par : (h.strokes ?? 0)), 0);
    const scoredSum = (arr: typeof holes, key: "strokes" | "par") =>
      arr.filter((h) => h.strokes != null).reduce((s, h) => s + (key === "par" ? h.par : h.strokes!), 0);

    const totalStrokes = scoredSum(holes, "strokes");
    const totalPar = scoredSum(holes, "par");

    res.json({
      roundId: round.id,
      ownerId: round.userId,
      playerName: round.user.name,
      courseName: round.course.name,
      playedAt: round.playedAt,
      inProgress,
      holesScored,
      totalHoles,
      holes,
      frontNine: {
        strokes: scoredSum(frontNine, "strokes"),
        par: sum(frontNine, "par"),
      },
      backNine: backNine.length > 0 ? {
        strokes: scoredSum(backNine, "strokes"),
        par: sum(backNine, "par"),
      } : null,
      total: {
        strokes: totalStrokes,
        par: totalPar,
        scoreToPar: totalStrokes - totalPar,
      },
    });
  } catch (err) {
    console.error("GET /rounds/shared/:shareId error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// All remaining round routes require a valid JWT
router.use(requireAuth);

// GET /rounds/live — in-progress rounds from friends
router.get("/live", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

    // Get friend IDs (excluding blocked)
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
    const activeFriendIds = friendIds.filter((id) => !blockedIds.has(id));

    // Fetch live rounds from friends
    const liveRounds = activeFriendIds.length > 0
      ? await prisma.round.findMany({
          where: {
            userId: { in: activeFriendIds },
            completedAt: null,
            lastScoredAt: { gte: fourHoursAgo },
          },
          include: {
            user: { select: { name: true } },
            course: { select: { name: true, holes: { select: { number: true, par: true } } } },
            roundHoles: { select: { strokes: true, hole: { select: { number: true, par: true } } } },
          },
          orderBy: { lastScoredAt: "desc" },
        })
      : [];

    // Also get user's own in-progress round
    const ownRound = await prisma.round.findFirst({
      where: { userId, completedAt: null, lastScoredAt: { gte: fourHoursAgo } },
      include: {
        user: { select: { name: true } },
        course: { select: { name: true, holes: { select: { number: true, par: true } } } },
        roundHoles: { select: { strokes: true, hole: { select: { number: true, par: true } } } },
      },
      orderBy: { lastScoredAt: "desc" },
    });

    const formatLiveRound = (r: typeof liveRounds[0]) => {
      const holesCompleted = r.roundHoles.length;
      const currentScoreToPar = r.roundHoles.reduce((s, rh) => s + (rh.strokes - rh.hole.par), 0);
      const currentHoleNumber = r.roundHoles.length > 0
        ? Math.max(...r.roundHoles.map((rh) => rh.hole.number))
        : 0;
      return {
        roundId: r.id,
        shareId: r.shareId,
        playerId: r.userId,
        playerName: r.user.name,
        courseName: r.course.name,
        holesCompleted,
        totalHoles: r.course.holes.length,
        currentScoreToPar,
        lastScoredAt: r.lastScoredAt,
        currentHoleNumber,
      };
    };

    const friends = liveRounds.map(formatLiveRound);
    const own = ownRound ? formatLiveRound(ownRound) : null;

    res.json({ liveRounds: friends, ownLiveRound: own });
  } catch (err) {
    console.error("GET /rounds/live error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /rounds/:id/live-scorecard — lightweight in-progress scorecard for spectators
router.get("/:id/live-scorecard", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const roundId = parseInt(String(req.params.id), 10);
    if (isNaN(roundId)) { res.status(400).json({ error: "Invalid round ID" }); return; }

    const round = await prisma.round.findUnique({
      where: { id: roundId },
      include: {
        user: { select: { name: true } },
        course: { select: { name: true, holes: { orderBy: { number: "asc" }, select: { number: true, par: true, distance: true } } } },
        roundHoles: { include: { hole: { select: { number: true, par: true } } }, orderBy: { hole: { number: "asc" } } },
      },
    });

    if (!round) { res.status(404).json({ error: "Round not found" }); return; }

    // Access check: must be friend or self
    if (round.userId !== userId) {
      const friendship = await prisma.friendship.findFirst({
        where: {
          status: "ACCEPTED",
          OR: [
            { requesterId: userId, addresseeId: round.userId },
            { requesterId: round.userId, addresseeId: userId },
          ],
        },
      });
      if (!friendship) { res.status(403).json({ error: "Not authorized" }); return; }
    }

    const holes = round.course.holes.map((hole) => {
      const rh = round.roundHoles.find((rh) => rh.hole.number === hole.number);
      return {
        number: hole.number,
        par: hole.par,
        distance: hole.distance,
        strokes: rh?.strokes ?? null,
        scoreToPar: rh ? rh.strokes - hole.par : null,
      };
    });

    const scoredHoles = round.roundHoles;
    const currentScoreToPar = scoredHoles.reduce((s, rh) => s + (rh.strokes - rh.hole.par), 0);
    const holesCompleted = scoredHoles.length;
    const totalHoles = round.course.holes.length;

    res.json({
      roundId: round.id,
      shareId: round.shareId,
      playerId: round.userId,
      playerName: round.user.name,
      courseName: round.course.name,
      holes,
      holesCompleted,
      totalHoles,
      currentScoreToPar,
      lastScoredAt: round.lastScoredAt,
      completedAt: round.completedAt,
      playedAt: round.playedAt,
    });
  } catch (err) {
    console.error("GET /rounds/:id/live-scorecard error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /rounds/feed — friends' recent completed rounds
router.get("/feed", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const limit = Math.min(parseInt(String(req.query.limit || "20"), 10) || 20, 50);
    const cursor = req.query.cursor ? parseInt(String(req.query.cursor), 10) : undefined;

    // Get accepted friend IDs in one query, excluding blocked relationships
    const friendships = await prisma.friendship.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      select: { requesterId: true, addresseeId: true },
    });

    const friendIds = friendships.map((f) =>
      f.requesterId === userId ? f.addresseeId : f.requesterId
    );

    // Get blocked user IDs (in either direction)
    const blocks = await prisma.friendship.findMany({
      where: {
        status: "BLOCKED",
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      select: { requesterId: true, addresseeId: true },
    });
    const blockedIds = new Set(
      blocks.map((b) => (b.requesterId === userId ? b.addresseeId : b.requesterId))
    );
    const activeFriendIds = friendIds.filter((id) => !blockedIds.has(id));

    // Fetch friends' completed rounds, plus rounds where the current user is
    // tagged as a playing partner (even if owner is not a friend).
    const feedRoundFilter = {
      OR: [
        ...(activeFriendIds.length > 0 ? [{ userId: { in: activeFriendIds } }] : []),
        { partners: { some: { userId } } },
      ],
      ...(cursor ? { id: { lt: cursor } } : {}),
    };

    const feedRounds = (activeFriendIds.length > 0 || true)
      ? await prisma.round.findMany({
          where: feedRoundFilter,
          include: {
            user: { select: { name: true } },
            course: {
              select: {
                name: true,
                courseRating: true,
                slopeRating: true,
                holes: { select: { par: true } },
                _count: { select: { holes: true } },
              },
            },
            roundHoles: {
              select: { strokes: true, hole: { select: { par: true } } },
            },
            partners: {
              include: { user: { select: { id: true, name: true } } },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: { id: "desc" },
          take: limit + 1,
        })
      : [];

    const hasMore = feedRounds.length > limit;
    const page = hasMore ? feedRounds.slice(0, limit) : feedRounds;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    const scoredRounds = page.filter((r) => r.roundHoles.length > 0);
    const roundIds = scoredRounds.map((r) => r.id);

    // Batch-fetch reactions, comments, and reviews for all feed rounds
    const [allReactions, allComments, allReviews] = await Promise.all([
      roundIds.length > 0
        ? prisma.roundReaction.findMany({
            where: { roundId: { in: roundIds } },
            select: { roundId: true, userId: true, emoji: true },
          })
        : [],
      roundIds.length > 0
        ? prisma.roundComment.findMany({
            where: { roundId: { in: roundIds } },
            include: { user: { select: { id: true, name: true } } },
            orderBy: { createdAt: "desc" },
          })
        : [],
      roundIds.length > 0
        ? prisma.courseReview.findMany({
            where: { roundId: { in: roundIds } },
            select: { roundId: true, rating: true, text: true },
          })
        : [],
    ]);
    const reviewsByRound = new Map<number, { rating: number; text: string | null }>();
    for (const rv of allReviews) reviewsByRound.set(rv.roundId, { rating: rv.rating, text: rv.text });

    // Build per-round reaction summaries
    const reactionsByRound = new Map<number, { summary: Record<string, number>; userReaction: string | null }>();
    for (const r of allReactions) {
      if (!reactionsByRound.has(r.roundId)) reactionsByRound.set(r.roundId, { summary: {}, userReaction: null });
      const entry = reactionsByRound.get(r.roundId)!;
      entry.summary[r.emoji] = (entry.summary[r.emoji] || 0) + 1;
      if (r.userId === userId) entry.userReaction = r.emoji;
    }

    // Build per-round comment data (count + 2 most recent)
    const commentsByRound = new Map<number, { commentCount: number; recentComments: { userId: number; name: string; text: string }[] }>();
    for (const c of allComments) {
      if (!commentsByRound.has(c.roundId)) commentsByRound.set(c.roundId, { commentCount: 0, recentComments: [] });
      const entry = commentsByRound.get(c.roundId)!;
      entry.commentCount++;
      if (entry.recentComments.length < 2) entry.recentComments.push({ userId: c.user.id, name: c.user.name, text: c.text });
    }
    // Reverse recentComments so oldest-first (they were fetched desc)
    for (const entry of commentsByRound.values()) entry.recentComments.reverse();

    const feed = scoredRounds.map((r) => {
        const totalStrokes = r.roundHoles.reduce((s, rh) => s + rh.strokes, 0);
        const totalPar = r.roundHoles.reduce((s, rh) => s + rh.hole.par, 0);
        const reactions = reactionsByRound.get(r.id) || { summary: {}, userReaction: null };
        const comments = commentsByRound.get(r.id) || { commentCount: 0, recentComments: [] };
        return {
          id: r.id,
          shareId: r.shareId,
          playerId: r.userId,
          playerName: r.user.name,
          playedAt: r.playedAt,
          courseName: r.course.name,
          totalStrokes,
          scoreToPar: totalStrokes - totalPar,
          totalHoles: r.roundHoles.length,
          courseHoles: r.course._count.holes,
          reactionSummary: reactions.summary,
          userReaction: reactions.userReaction,
          commentCount: comments.commentCount,
          recentComments: comments.recentComments,
          review: reviewsByRound.get(r.id) ?? null,
          partners: r.partners.map((p) => ({ id: p.user.id, name: p.user.name })),
          viewerTagged: r.partners.some((p) => p.userId === userId),
        };
      });

    // Latest own round (within 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const latestOwn = await prisma.round.findFirst({
      where: {
        userId,
        playedAt: { gte: sevenDaysAgo },
        roundHoles: { some: {} },
      },
      include: {
        course: {
          select: {
            name: true,
            holes: { select: { par: true } },
            _count: { select: { holes: true } },
          },
        },
        roundHoles: {
          select: { strokes: true, hole: { select: { par: true } } },
        },
        partners: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { playedAt: "desc" },
    });

    let latestOwnRound = null;
    if (latestOwn && latestOwn.roundHoles.length > 0) {
      const totalStrokes = latestOwn.roundHoles.reduce((s, rh) => s + rh.strokes, 0);
      const totalPar = latestOwn.roundHoles.reduce((s, rh) => s + rh.hole.par, 0);

      // Fetch reactions + comments for own round
      const [ownReactions, ownComments] = await Promise.all([
        prisma.roundReaction.findMany({
          where: { roundId: latestOwn.id },
          select: { emoji: true, userId: true },
        }),
        prisma.roundComment.findMany({
          where: { roundId: latestOwn.id },
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
          take: 2,
        }),
      ]);
      const ownSummary: Record<string, number> = {};
      let ownUserReaction: string | null = null;
      for (const r of ownReactions) {
        ownSummary[r.emoji] = (ownSummary[r.emoji] || 0) + 1;
        if (r.userId === userId) ownUserReaction = r.emoji;
      }

      const ownReview = await prisma.courseReview.findUnique({
        where: { roundId: latestOwn.id },
        select: { rating: true, text: true },
      });
      latestOwnRound = {
        id: latestOwn.id,
        shareId: latestOwn.shareId,
        playedAt: latestOwn.playedAt,
        courseName: latestOwn.course.name,
        totalStrokes,
        scoreToPar: totalStrokes - totalPar,
        totalHoles: latestOwn.roundHoles.length,
        courseHoles: latestOwn.course._count.holes,
        reactionSummary: ownSummary,
        userReaction: ownUserReaction,
        commentCount: await prisma.roundComment.count({ where: { roundId: latestOwn.id } }),
        recentComments: ownComments.reverse().map((c) => ({ userId: c.user.id, name: c.user.name, text: c.text })),
        review: ownReview,
        partners: latestOwn.partners.map((p) => ({ id: p.user.id, name: p.user.name })),
      };
    }

    // Open tee times from friends (FRIENDS visibility, future, OPEN)
    const now = new Date();
    const myTeeTimeIds = await prisma.teeTimeParticipant.findMany({
      where: { userId },
      select: { teeTimeId: true },
    });
    const myTtIds = new Set(myTeeTimeIds.map((p) => p.teeTimeId));

    const openTeeTimes = activeFriendIds.length > 0
      ? await prisma.teeTime.findMany({
          where: {
            creatorId: { in: activeFriendIds },
            visibility: "FRIENDS",
            status: "OPEN",
            dateTime: { gt: now },
            id: { notIn: [...myTtIds] },
          },
          include: {
            course: { select: { name: true } },
            creator: { select: { name: true } },
            participants: { where: { status: "CONFIRMED" }, select: { userId: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        })
      : [];

    const feedTeeTimes = openTeeTimes.map((tt) => ({
      id: tt.id,
      type: "tee_time" as const,
      creatorId: tt.creatorId,
      creatorName: tt.creator.name,
      courseName: tt.courseId && tt.course ? tt.course.name : (tt.courseName ?? null),
      dateTime: tt.dateTime,
      spotsTotal: tt.spotsTotal,
      spotsFilled: tt.participants.length,
      notes: tt.notes,
      createdAt: tt.createdAt,
    }));

    res.json({ feed, feedTeeTimes, nextCursor, latestOwnRound });
  } catch (err) {
    console.error("GET /rounds/feed error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /rounds/leaderboard — score leaderboard among friends
router.get("/leaderboard", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const timeframe = String(req.query.timeframe || "month");

    // Calculate date filter
    let dateFilter: Date | null = null;
    if (timeframe === "week") {
      dateFilter = new Date();
      dateFilter.setDate(dateFilter.getDate() - 7);
    } else if (timeframe === "month") {
      dateFilter = new Date();
      dateFilter.setDate(dateFilter.getDate() - 30);
    }

    // Get friend IDs (excluding blocked)
    const friendships = await prisma.friendship.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      select: { requesterId: true, addresseeId: true },
    });
    const friendIds = friendships.map((f) =>
      f.requesterId === userId ? f.addresseeId : f.requesterId
    );

    const blocks = await prisma.friendship.findMany({
      where: {
        status: "BLOCKED",
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      select: { requesterId: true, addresseeId: true },
    });
    const blockedIds = new Set(
      blocks.map((b) => (b.requesterId === userId ? b.addresseeId : b.requesterId))
    );

    // All participants = current user + non-blocked friends
    const participantIds = [userId, ...friendIds.filter((id) => !blockedIds.has(id))];

    // Get user names
    const users = await prisma.user.findMany({
      where: { id: { in: participantIds } },
      select: { id: true, name: true },
    });
    const nameMap = new Map(users.map((u) => [u.id, u.name]));

    // Fetch all rounds for participants in the timeframe, with hole counts
    const rounds = await prisma.round.findMany({
      where: {
        userId: { in: participantIds },
        ...(dateFilter ? { playedAt: { gte: dateFilter } } : {}),
      },
      include: {
        course: { select: { _count: { select: { holes: true } } } },
        roundHoles: {
          select: { strokes: true, hole: { select: { par: true } } },
        },
      },
    });

    // Aggregate per user
    const statsMap = new Map<number, { roundsPlayed: number; best: number | null; totalScoreToPar: number; count18: number }>();
    for (const id of participantIds) {
      statsMap.set(id, { roundsPlayed: 0, best: null, totalScoreToPar: 0, count18: 0 });
    }

    for (const r of rounds) {
      if (r.roundHoles.length === 0) continue;
      const entry = statsMap.get(r.userId)!;
      const totalStrokes = r.roundHoles.reduce((s, rh) => s + rh.strokes, 0);
      const totalPar = r.roundHoles.reduce((s, rh) => s + rh.hole.par, 0);
      const scoreToPar = totalStrokes - totalPar;

      entry.roundsPlayed++;

      // Only count completed 18-hole rounds for averages and best
      if (r.roundHoles.length === r.course._count.holes && r.course._count.holes >= 18) {
        entry.count18++;
        entry.totalScoreToPar += scoreToPar;
        if (entry.best === null || scoreToPar < entry.best) {
          entry.best = scoreToPar;
        }
      }
    }

    // Get handicap indexes
    const handicaps = await prisma.linkedHandicap.findMany({
      where: { userId: { in: participantIds } },
      select: { userId: true, handicapIndex: true },
    });
    const handicapMap = new Map(handicaps.map((h) => [h.userId, h.handicapIndex]));

    // Calculate handicaps for those without linked ones (parallel)
    const missingHandicapIds = participantIds.filter((id) => !handicapMap.has(id));
    const calcResults = await Promise.all(
      missingHandicapIds.map(async (id) => {
        const userRounds = await prisma.round.findMany({
          where: { userId: id },
          include: {
            course: {
              select: { name: true, courseRating: true, slopeRating: true, _count: { select: { holes: true } } },
            },
            roundHoles: { select: { strokes: true } },
          },
          orderBy: { playedAt: "desc" },
          take: 20,
        });
        const diffs = calculateDifferentials(userRounds);
        const result = calculateHandicapIndex(diffs);
        return { id, index: result?.handicapIndex ?? null };
      })
    );
    for (const { id, index } of calcResults) {
      if (index != null) handicapMap.set(id, index);
    }

    const leaderboard = participantIds.map((id) => {
      const s = statsMap.get(id)!;
      return {
        userId: id,
        name: nameMap.get(id) ?? "Unknown",
        roundsPlayed: s.roundsPlayed,
        bestScoreToPar: s.best,
        avgScoreToPar: s.count18 > 0 ? parseFloat((s.totalScoreToPar / s.count18).toFixed(1)) : null,
        handicapIndex: handicapMap.get(id) ?? null,
      };
    });

    // Sort: users with avgScoreToPar first (ascending), then nulls at bottom
    leaderboard.sort((a, b) => {
      if (a.avgScoreToPar === null && b.avgScoreToPar === null) return 0;
      if (a.avgScoreToPar === null) return 1;
      if (b.avgScoreToPar === null) return -1;
      return a.avgScoreToPar - b.avgScoreToPar;
    });

    res.json(leaderboard);
  } catch (err) {
    console.error("GET /rounds/leaderboard error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /rounds/leaderboard/handicap — handicap leaderboard with trend
router.get("/leaderboard/handicap", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    // Get friend IDs (excluding blocked)
    const friendships = await prisma.friendship.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      select: { requesterId: true, addresseeId: true },
    });
    const friendIds = friendships.map((f) =>
      f.requesterId === userId ? f.addresseeId : f.requesterId
    );

    const blocks = await prisma.friendship.findMany({
      where: {
        status: "BLOCKED",
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      select: { requesterId: true, addresseeId: true },
    });
    const blockedIds = new Set(
      blocks.map((b) => (b.requesterId === userId ? b.addresseeId : b.requesterId))
    );

    const participantIds = [userId, ...friendIds.filter((id) => !blockedIds.has(id))];

    const users = await prisma.user.findMany({
      where: { id: { in: participantIds } },
      select: { id: true, name: true },
    });
    const nameMap = new Map(users.map((u) => [u.id, u.name]));

    // Batch-fetch linked handicaps for all participants
    const linkedHandicaps = await prisma.linkedHandicap.findMany({
      where: { userId: { in: participantIds } },
      select: { userId: true, handicapIndex: true },
    });
    const linkedMap = new Map(linkedHandicaps.map((l) => [l.userId, l.handicapIndex]));

    // Calculate current handicap and trend for each participant (parallel)
    const results = await Promise.all(
      participantIds.map(async (id) => {
        const rounds = await prisma.round.findMany({
          where: { userId: id },
          include: {
            course: {
              select: { name: true, courseRating: true, slopeRating: true, _count: { select: { holes: true } } },
            },
            roundHoles: { select: { strokes: true } },
          },
          orderBy: { playedAt: "asc" },
        });

        const allDiffs = calculateDifferentials(rounds);
        const currentResult = calculateHandicapIndex(allDiffs);
        const currentIndex = linkedMap.get(id) ?? currentResult?.handicapIndex ?? null;

        // Trend: compare current to 5 rounds ago
        let trend: "improving" | "declining" | "stable" | null = null;
        if (allDiffs.length >= 8) {
          const olderDiffs = allDiffs.slice(0, -5);
          const olderResult = calculateHandicapIndex(olderDiffs);
          if (olderResult && currentResult) {
            const diff = currentResult.handicapIndex - olderResult.handicapIndex;
            if (diff < -0.5) trend = "improving";
            else if (diff > 0.5) trend = "declining";
            else trend = "stable";
          }
        }

        return {
          userId: id,
          name: nameMap.get(id) ?? "Unknown",
          handicapIndex: currentIndex,
          trend,
        };
      })
    );

    // Sort by handicap ascending, nulls at bottom
    results.sort((a, b) => {
      if (a.handicapIndex === null && b.handicapIndex === null) return 0;
      if (a.handicapIndex === null) return 1;
      if (b.handicapIndex === null) return -1;
      return a.handicapIndex - b.handicapIndex;
    });

    res.json(results);
  } catch (err) {
    console.error("GET /rounds/leaderboard/handicap error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Fetch a course from golfcourseapi.com and upsert it into our DB.
// Returns the local Course record (with holes).
async function importExternalCourse(
  externalId: string,
  teeName?: string,
  teeGender?: "male" | "female"
) {
  /* Short-circuit: skip the external API when this exact tee is already
     imported. The free tier allows 300 calls a day, so this matters.

     Two keys can hold it. `<id>_<tee>_<gender>` is unambiguous. `<id>_<tee>`
     is the legacy shape, kept for tees that were already imported (see the
     note on `dbExternalId` below), and it does NOT identify a gender on its
     own — returning it for any gender is what made a women's tee resolve to
     the men's course. The stored name settles it: a female tee always carries
     the "(Women's)" qualifier, so a legacy row without one is male. That holds
     for rows written before this change too, because the old resolution
     matched the men's list first. */
  const WOMENS = "(Women's)";
  if (teeName) {
    const legacyKey = `${externalId}_${teeName}`;
    const keys = teeGender ? [legacyKey, `${externalId}_${teeName}_${teeGender}`] : [legacyKey];
    const candidates = await prisma.course.findMany({
      where: { externalId: { in: keys } },
      include: { holes: { orderBy: { number: "asc" } } },
    });

    const exact = candidates.find((c) => c.externalId !== legacyKey);
    if (exact) return exact;

    const legacyRow = candidates.find((c) => c.externalId === legacyKey);
    if (legacyRow) {
      const rowIsWomens = legacyRow.name.endsWith(WOMENS);
      // With no gender requested, behave exactly as before.
      if (!teeGender || rowIsWomens === (teeGender === "female")) return legacyRow;
    }
  }

  const apiKey = process.env.GOLF_API_KEY;
  if (!apiKey) throw new Error("Golf API not configured");

  const response = await fetch(
    `https://api.golfcourseapi.com/v1/courses/${externalId}`,
    { headers: { Authorization: `Key ${apiKey}` } }
  );
  if (!response.ok) throw new Error(`External API returned ${response.status}`);

  type ExternalHole = {
    par: number;
    yardage: number;
  };
  type ExternalTeeSet = {
    tee_name: string;
    holes: ExternalHole[];
    course_rating?: number;
    slope_rating?: number;
  };
  type ExternalCourse = {
    id: number;
    course_name: string;
    club_name?: string;
    tees?: { male?: ExternalTeeSet[]; female?: ExternalTeeSet[] };
  };

  const { course: data } = (await response.json()) as { course: ExternalCourse };

  const male = (data.tees?.male ?? []).map((t) => ({ tee: t, gender: "male" as const }));
  const female = (data.tees?.female ?? []).map((t) => ({ tee: t, gender: "female" as const }));
  const allTees = [...male, ...female];

  /* Resolve on (name, gender), not name alone.
     Clubs commonly list the same colour for both, off different rating plates.
     Matching on the name meant `find` always returned the men's set: a player
     choosing the women's White at Avondale silently got the men's — different
     par, different yardages, and a different course rating and slope, which
     then fed a wrong Score Differential into their Handicap Index. */
  const picked = teeName
    ? allTees.find((t) => t.tee.tee_name === teeName && (!teeGender || t.gender === teeGender))
    : allTees[0];
  const teeSet = picked?.tee;
  if (!picked || !teeSet || !teeSet.holes?.length) {
    throw new Error("No hole data available for this course");
  }

  const baseName = data.club_name && data.club_name !== data.course_name
    ? `${data.course_name} (${data.club_name})`
    : data.course_name;
  /* The em dash is the delimiter `formatCourseName` splits on to separate the
     club from the tee set; it is never rendered.

     Every women's tee carries the qualifier, not just the ambiguous ones. It
     reads as useful on its own, and it is what lets the cache lookup above
     tell a legacy-keyed row's gender without a schema column or an API call.
     Men's tees stay unqualified, which is also the name they have always had,
     so nothing already imported is renamed. */
  const genderSuffix = picked.gender === "female" ? ` ${WOMENS}` : "";
  const courseName = `${baseName} — ${teeSet.tee_name} Tees${genderSuffix}`;

  /* The key includes the tee name so each tee set is its own course, and the
     gender only when it has to be.

     Before this, both genders' "White" mapped to `<id>_White` and collapsed
     into one row — whichever was imported first won, and the second silently
     inherited its holes and rating. Appending the gender unconditionally would
     have fixed that but orphaned every course already imported, splitting
     players' histories in two. So the tee the old code would have resolved to
     keeps the old key, and only the ones it could never reach get a new one. */
  const legacyPick = allTees.find((t) => t.tee.tee_name === teeSet.tee_name);
  const dbExternalId =
    legacyPick === picked
      ? `${data.id}_${teeSet.tee_name}`
      : `${data.id}_${teeSet.tee_name}_${picked.gender}`;

  // Upsert course so concurrent requests don't create duplicates
  const course = await prisma.course.upsert({
    where: { externalId: dbExternalId },
    create: {
      name: courseName,
      externalId: dbExternalId,
      courseRating: teeSet.course_rating ?? null,
      slopeRating: teeSet.slope_rating ?? null,
      holes: {
        // Holes come ordered in the array — use index for hole number
        create: teeSet.holes.map((h, idx) => ({
          number: idx + 1,
          par: h.par,
          distance: h.yardage,
        })),
      },
    },
    update: {},
    include: { holes: { orderBy: { number: "asc" } } },
  });

  return course;
}

// POST /rounds — start a new round at a course
router.post("/", async (req: AuthRequest, res: Response) => {
  const schema = z
    .object({
      courseId: z.number().int().positive().optional(),
      externalCourseId: z.string().optional(),
      teeName: z.string().optional(),
      // Optional so an older client, or a queued offline round created before
      // this shipped, still resolves the way it always did.
      teeGender: z.enum(["male", "female"]).optional(),
      playedAt: z.coerce.date().optional(),
    })
    .refine((d) => d.courseId != null || d.externalCourseId != null, {
      message: "Either courseId or externalCourseId is required",
    });

  const result = schema.safeParse(req.body);
  if (!result.success) {
    sendValidationError(res, result.error);
    return;
  }

  const { courseId, externalCourseId, teeName, teeGender, playedAt } = result.data;

  try {
    let resolvedCourseId: number;

    if (externalCourseId) {
      const course = await importExternalCourse(externalCourseId, teeName, teeGender);
      resolvedCourseId = course.id;
    } else {
      const course = await prisma.course.findUnique({ where: { id: courseId! } });
      if (!course) {
        res.status(404).json({ error: "Course not found" });
        return;
      }
      resolvedCourseId = course.id;
    }

    const round = await prisma.round.create({
      data: {
        userId: req.userId!,
        courseId: resolvedCourseId,
        playedAt: playedAt ?? new Date(),
        shareId: nanoid(10),
      },
      include: {
        course: { include: { holes: { orderBy: { number: "asc" } } } },
        roundHoles: true,
      },
    });

    res.status(201).json(round);
  } catch (err) {
    console.error("POST /rounds error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Shared completion side effects: mark the round complete, evaluate
// achievements, and notify friends. Used both by the auto-complete path
// (all 18 holes scored) and the explicit "finish round" endpoint (9 holes,
// abandoned rounds, etc).
async function finalizeRound(roundId: number, userId: number) {
  const completedRound = await prisma.round.update({
    where: { id: roundId },
    data: { completedAt: new Date() },
    include: {
      user: { select: { name: true } },
      course: { select: { name: true } },
      roundHoles: { include: { hole: { select: { par: true } } } },
    },
  });

  const totalStrokes = completedRound.roundHoles.reduce((s, rh) => s + rh.strokes, 0);
  const totalPar = completedRound.roundHoles.reduce((s, rh) => s + rh.hole.par, 0);
  const scoreToPar = totalStrokes - totalPar;
  const scoreStr = scoreToPar === 0 ? "even par" : scoreToPar > 0 ? `+${scoreToPar}` : `${scoreToPar}`;
  const holesCompleted = completedRound.roundHoles.length;
  const throughStr = holesCompleted < 18 ? ` through ${holesCompleted}` : "";
  const courseName = completedRound.course.name.replace(/\s*—.*$/, "");

  // Evaluate achievements now that round is complete
  const evalResult = await evaluateAchievements(userId);
  const newlyUnlocked = evalResult.newlyUnlocked;

  // Notify all accepted friends (fire-and-forget)
  const friendships = await prisma.friendship.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    select: { requesterId: true, addresseeId: true },
  });

  for (const f of friendships) {
    const friendId = f.requesterId === userId ? f.addresseeId : f.requesterId;
    sendPushToUser(
      friendId,
      "New round posted",
      `${completedRound.user.name} shot ${scoreStr}${throughStr} at ${courseName}`,
      "/feed"
    ).catch(() => {});
  }

  // If a Personal Best was unlocked/updated, push a special notification to friends
  const pb = newlyUnlocked.find((a) => a.type === "PERSONAL_BEST");
  if (pb) {
    const pbScore = (pb.metadata as { score?: number } | null)?.score ?? totalStrokes;
    for (const f of friendships) {
      const friendId = f.requesterId === userId ? f.addresseeId : f.requesterId;
      sendPushToUser(
        friendId,
        "New personal best!",
        `${completedRound.user.name} just set a new PB — ${pbScore} at ${courseName}!`,
        "/feed"
      ).catch(() => {});
    }
  }

  return { completedRound, newlyUnlocked, totalStrokes, scoreToPar, holesCompleted };
}

function enrichAchievements(newlyUnlocked: Awaited<ReturnType<typeof evaluateAchievements>>["newlyUnlocked"]) {
  return newlyUnlocked.map((a) => {
    const def = getAchievementDef(a.type);
    return {
      id: a.id,
      type: a.type,
      name: def?.name ?? a.type,
      description: def?.description ?? "",
      emoji: def?.emoji ?? "🏆",
      category: def?.category ?? "MILESTONE",
      unlockedAt: a.unlockedAt,
      metadata: a.metadata,
    };
  });
}

// POST /rounds/:id/complete — finish a round with however many holes are scored.
// Lets players wrap up 9-hole rounds (or bail out early) instead of the round
// sitting "live" forever waiting for 18 scored holes.
router.post("/:id/complete", async (req: AuthRequest, res: Response) => {
  const roundId = parseInt(String(req.params.id));
  if (isNaN(roundId)) {
    res.status(400).json({ error: "Invalid round ID" });
    return;
  }

  try {
    const round = await prisma.round.findUnique({
      where: { id: roundId },
      include: { _count: { select: { roundHoles: true } } },
    });
    if (!round) {
      res.status(404).json({ error: "Round not found" });
      return;
    }
    if (round.userId !== req.userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (round.completedAt) {
      res.status(400).json({ error: "Round is already completed" });
      return;
    }
    if (round._count.roundHoles === 0) {
      res.status(400).json({ error: "Score at least one hole before finishing the round" });
      return;
    }

    const { completedRound, newlyUnlocked, totalStrokes, scoreToPar, holesCompleted } =
      await finalizeRound(roundId, req.userId!);

    res.json({
      id: completedRound.id,
      completedAt: completedRound.completedAt,
      totalStrokes,
      scoreToPar,
      holesCompleted,
      newlyUnlocked: enrichAchievements(newlyUnlocked),
    });
  } catch (err) {
    console.error("POST /rounds/:id/complete error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /rounds/:id/holes/:holeId — submit or update a score for one hole
router.put("/:id/holes/:holeId", async (req: AuthRequest, res: Response) => {
  const roundId = parseInt(String(req.params.id));
  const holeId = parseInt(String(req.params.holeId));

  if (isNaN(roundId) || isNaN(holeId)) {
    res.status(400).json({ error: "Invalid round or hole ID" });
    return;
  }

  const schema = z
    .object({
      // Max 20 strokes per hole is generous but prevents garbage data
      strokes: z.number().int().min(1).max(20),
      putts: z.number().int().min(0).max(20).optional(),
      teeShotDirection: z.enum(["fairway", "left", "right", "penalty"]).optional(),
      teeShotDistance: z.enum(["short", "on", "long"]).optional(),
      approachResult: z.enum(["gir", "short", "long", "left", "right"]).optional(),
      sandShots: z.number().int().min(0).max(20).optional(),
      penalties: z.number().int().min(0).max(20).optional(),
      hazards: z.number().int().min(0).max(20).optional(),
    })
    /* Every one of these is a subset of the strokes played on the hole, so
       none can exceed the hole's score. Putts are the strict case — you cannot
       hole out in putts alone, since something has to have got the ball onto
       the green — so they cap at strokes - 1, while a sand shot or a penalty
       can in principle account for every stroke on the hole.

       The client clamps these as you tap, but the client is not the only way
       in: the offline queue replays whatever was captured at the time, so a
       score edited downward after the fact could otherwise land a hole with
       three penalties on a score of two. */
    .superRefine((v, ctx) => {
      const cap = (field: "putts" | "sandShots" | "penalties" | "hazards", max: number) => {
        const value = v[field];
        if (value != null && value > max) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `${field} cannot exceed ${max} on a hole scored ${v.strokes}`,
          });
        }
      };
      cap("putts", v.strokes - 1);
      cap("sandShots", v.strokes);
      cap("penalties", v.strokes);
      cap("hazards", v.strokes);
    });

  const result = schema.safeParse(req.body);
  if (!result.success) {
    sendValidationError(res, result.error);
    return;
  }

  try {
    const round = await prisma.round.findUnique({
      where: { id: roundId },
      include: { course: { select: { _count: { select: { holes: true } } } } },
    });
    if (!round) {
      res.status(404).json({ error: "Round not found" });
      return;
    }
    if (round.userId !== req.userId) {
      // Return 403, not 404 — the round exists, the user just can't touch it
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Verify the hole actually belongs to this round's course
    const hole = await prisma.hole.findUnique({ where: { id: holeId } });
    if (!hole || hole.courseId !== round.courseId) {
      res.status(404).json({ error: "Hole not found on this course" });
      return;
    }

    const { strokes, putts, teeShotDirection, teeShotDistance, approachResult, sandShots, penalties, hazards } = result.data;
    const holeData = { strokes, putts, teeShotDirection, teeShotDistance, approachResult, sandShots, penalties, hazards };

    // Check scored count before upsert (for start notification)
    const prevScoredCount = await prisma.roundHole.count({ where: { roundId } });

    // Upsert — re-submitting a score corrects it rather than errors
    const roundHole = await prisma.roundHole.upsert({
      where: { roundId_holeId: { roundId, holeId } },
      create: { roundId, holeId, ...holeData },
      update: holeData,
      include: { hole: true },
    });

    // Update lastScoredAt heartbeat
    await prisma.round.update({
      where: { id: roundId },
      data: { lastScoredAt: new Date() },
    });

    // Send "round started" notification on first hole scored (fire-and-forget)
    if (prevScoredCount === 0 && !round.startNotificationSent) {
      (async () => {
        await prisma.round.update({
          where: { id: roundId },
          data: { startNotificationSent: true },
        });
        const player = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
        const course = await prisma.course.findUnique({ where: { id: round.courseId }, select: { name: true } });
        if (player && course) {
          const courseName = course.name.replace(/\s*—.*$/, "");
          const friendships = await prisma.friendship.findMany({
            where: { status: "ACCEPTED", OR: [{ requesterId: req.userId! }, { addresseeId: req.userId! }] },
            select: { requesterId: true, addresseeId: true },
          });
          for (const f of friendships) {
            const friendId = f.requesterId === req.userId! ? f.addresseeId : f.requesterId;
            sendPushToUser(friendId, "Fairplay", `${player.name} just started a round at ${courseName}`, `/live/${roundId}`).catch(() => {});
          }
        }
      })().catch((e) => console.error("start-notification error:", e));
    }

    // Check if round just became complete (all holes scored, not previously completed)
    let newlyUnlockedAchievements: Awaited<ReturnType<typeof evaluateAchievements>>["newlyUnlocked"] = [];
    const courseHoleCount = round.course._count.holes;
    if (!round.completedAt && courseHoleCount >= 18) {
      const scoredCount = await prisma.roundHole.count({ where: { roundId } });

      if (scoredCount === courseHoleCount) {
        const finalized = await finalizeRound(roundId, req.userId!);
        newlyUnlockedAchievements = finalized.newlyUnlocked;
      }
    }

    res.json({ ...roundHole, newlyUnlocked: enrichAchievements(newlyUnlockedAchievements) });
  } catch (err) {
    console.error("PUT /rounds/:id/holes/:holeId error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /rounds — current user's round history with computed totals
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const rounds = await prisma.round.findMany({
      where: { userId: req.userId! },
      include: {
        course: { select: { id: true, name: true, externalId: true } },
        roundHoles: {
          include: { hole: { select: { number: true, par: true } } },
          orderBy: { hole: { number: "asc" } },
        },
      },
      orderBy: { playedAt: "desc" },
    });

    const enriched = rounds.map((round) => {
      const totalStrokes = round.roundHoles.reduce((s, rh) => s + rh.strokes, 0);
      const totalPar = round.roundHoles.reduce((s, rh) => s + rh.hole.par, 0);
      return {
        ...round,
        totalStrokes,
        scoreToPar: totalStrokes - totalPar,
        holesCompleted: round.roundHoles.length,
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error("GET /rounds error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /rounds/stats — aggregate stats for the current user
// IMPORTANT: this route must be defined before /:id — otherwise Express
// will try to look up a round with id "stats" and return a 400/404
router.get("/stats", async (req: AuthRequest, res: Response) => {
  try {
    const rounds = await prisma.round.findMany({
      where: { userId: req.userId! },
      include: {
        roundHoles: {
          include: { hole: { select: { par: true } } },
        },
      },
    });

    if (rounds.length === 0) {
      res.json({ roundsPlayed: 0 });
      return;
    }

    // Exclude rounds with no scores at all — likely abandoned
    const scoredRounds = rounds.filter((r) => r.roundHoles.length > 0);

    const toMetricHoles = (r: (typeof scoredRounds)[number]) =>
      r.roundHoles.map((rh) => ({
        par: rh.hole.par,
        strokes: rh.strokes,
        putts: rh.putts,
        teeShotDirection: rh.teeShotDirection,
        approachResult: rh.approachResult,
      }));

    // roundScoreToPar never returns null here — scoredRounds all have holes
    const scoresToPar = scoredRounds.map((r) => roundScoreToPar(toMetricHoles(r))!);

    const best = Math.min(...scoresToPar);
    const worst = Math.max(...scoresToPar);
    const average = scoresToPar.reduce((a, b) => a + b, 0) / scoresToPar.length;

    // Hole-level outcome breakdown (shared with lib/roundMetrics)
    const breakdown = holeBreakdown(scoredRounds.flatMap(toMetricHoles));

    res.json({
      roundsPlayed: rounds.length,
      averageScoreToPar: parseFloat(average.toFixed(2)),
      bestScoreToPar: best,
      worstScoreToPar: worst,
      holeBreakdown: breakdown,
    });
  } catch (err) {
    console.error("GET /rounds/stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /rounds/handicap — World Handicap System index for the current user
// Must be defined before /:id
router.get("/handicap", async (req: AuthRequest, res: Response) => {
  try {
    const rounds = await prisma.round.findMany({
      where: {
        userId: req.userId!,
        course: { courseRating: { not: null }, slopeRating: { not: null } },
      },
      include: {
        course: {
          select: {
            name: true,
            courseRating: true,
            slopeRating: true,
            _count: { select: { holes: true } },
          },
        },
        // `hole.par` is selected here and nowhere else that computes
        // differentials: this is the only caller that renders a to-par column.
        roundHoles: { select: { strokes: true, hole: { select: { par: true } } } },
      },
      orderBy: { playedAt: "desc" },
      /* WHS wants the 20 most recent *acceptable* scores, not the acceptable
         ones among the 20 most recent rounds. Filtering rating and slope in
         SQL removes the dominant reason a round is unacceptable, and the 60
         gives headroom for the remaining one — a round that was started and
         never fully scored — so the twenty are still found when a player has a
         run of abandoned rounds. `calculateHandicapIndex` takes the most
         recent twenty of whatever survives.

         Taking 20 rounds up front, as this did, meant one unrated course in
         the last twenty scores shrank the pool to 19 and moved the player onto
         a different row of the allocation table. */
      take: 60,
    });

    const differentials = calculateDifferentials(rounds);

    if (differentials.length < 3) {
      res.json({
        handicapIndex: null,
        totalEligible: differentials.length,
        minimumRequired: 3,
        differentials: [],
      });
      return;
    }

    const result = calculateHandicapIndex(differentials);
    res.json(result);
  } catch (err) {
    console.error("GET /rounds/handicap error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /rounds/handicap-history — handicap index over time
router.get("/handicap-history", async (req: AuthRequest, res: Response) => {
  try {
    const rounds = await prisma.round.findMany({
      where: { userId: req.userId! },
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
      orderBy: { playedAt: "asc" },
    });

    const allDifferentials = calculateDifferentials(rounds);

    const history: Array<{
      date: string;
      handicapIndex: number;
      roundNumber: number;
      courseName: string;
    }> = [];

    for (let i = 2; i < allDifferentials.length; i++) {
      const subset = allDifferentials.slice(0, i + 1);
      const result = calculateHandicapIndex(subset);
      if (result) {
        const diff = allDifferentials[i];
        history.push({
          date: diff.playedAt.toISOString(),
          handicapIndex: result.handicapIndex,
          roundNumber: i + 1,
          courseName: diff.courseName,
        });
      }
    }

    res.json(history);
  } catch (err) {
    console.error("GET /rounds/handicap-history error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /rounds/course-stats — aggregate stats grouped by course for current user
router.get("/course-stats", async (req: AuthRequest, res: Response) => {
  try {
    const rounds = await prisma.round.findMany({
      where: { userId: req.userId! },
      include: {
        course: { select: { id: true, name: true } },
        roundHoles: {
          include: { hole: { select: { number: true, par: true } } },
        },
      },
      orderBy: { playedAt: "desc" },
    });

    const courseMap = new Map<number, {
      courseId: number;
      courseName: string;
      rounds: Array<{ roundId: number; playedAt: Date; scoreToPar: number; totalStrokes: number; holesCompleted: number }>;
    }>();

    for (const round of rounds) {
      if (round.roundHoles.length === 0) continue;
      const totalStrokes = round.roundHoles.reduce((s, rh) => s + rh.strokes, 0);
      const totalPar = round.roundHoles.reduce((s, rh) => s + rh.hole.par, 0);
      if (!courseMap.has(round.courseId)) {
        courseMap.set(round.courseId, { courseId: round.courseId, courseName: round.course.name, rounds: [] });
      }
      courseMap.get(round.courseId)!.rounds.push({
        roundId: round.id,
        playedAt: round.playedAt,
        scoreToPar: totalStrokes - totalPar,
        totalStrokes,
        holesCompleted: round.roundHoles.length,
      });
    }

    const result = Array.from(courseMap.values()).map((c) => {
      const scores = c.rounds.map((r) => r.scoreToPar);
      return {
        courseId: c.courseId,
        courseName: c.courseName,
        roundsPlayed: c.rounds.length,
        averageScoreToPar: parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)),
        bestScoreToPar: Math.min(...scores),
        rounds: c.rounds,
      };
    });

    res.json(result);
  } catch (err) {
    console.error("GET /rounds/course-stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /rounds/course-stats/:courseId — per-hole stats for one course
router.get("/course-stats/:courseId", async (req: AuthRequest, res: Response) => {
  const courseId = parseInt(String(req.params.courseId));
  if (isNaN(courseId)) { res.status(400).json({ error: "Invalid course ID" }); return; }

  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: { holes: { orderBy: { number: "asc" } } },
    });
    if (!course) { res.status(404).json({ error: "Course not found" }); return; }

    const rounds = await prisma.round.findMany({
      where: { userId: req.userId!, courseId },
      include: { roundHoles: { include: { hole: true } } },
    });

    const holeStats = course.holes.map((hole) => {
      const scores: number[] = [];
      const puttsList: number[] = [];
      let girCount = 0, fairwayCount = 0, teeShotTracked = 0, approachTracked = 0;

      for (const round of rounds) {
        const rh = round.roundHoles.find((rh) => rh.holeId === hole.id);
        if (!rh) continue;
        scores.push(rh.strokes - hole.par);
        if (rh.putts != null) puttsList.push(rh.putts);
        if (hole.par >= 4) {
          if (rh.teeShotDirection) { teeShotTracked++; if (rh.teeShotDirection === "fairway") fairwayCount++; }
        }
        if (rh.approachResult) { approachTracked++; if (rh.approachResult === "gir") girCount++; }
      }

      return {
        holeId: hole.id,
        number: hole.number,
        par: hole.par,
        distance: hole.distance,
        roundsPlayed: scores.length,
        averageScoreToPar: scores.length > 0 ? parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : null,
        averagePutts: puttsList.length > 0 ? parseFloat((puttsList.reduce((a, b) => a + b, 0) / puttsList.length).toFixed(2)) : null,
        girRate: approachTracked > 0 ? parseFloat((girCount / approachTracked).toFixed(2)) : null,
        fairwayRate: teeShotTracked > 0 ? parseFloat((fairwayCount / teeShotTracked).toFixed(2)) : null,
      };
    });

    res.json({ courseId: course.id, courseName: course.name, holes: holeStats });
  } catch (err) {
    console.error("GET /rounds/course-stats/:courseId error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /rounds/insights — analyse weak points and generate improvement suggestions
router.get("/insights", async (req: AuthRequest, res: Response) => {
  try {
    const rounds = await prisma.round.findMany({
      where: { userId: req.userId! },
      include: { roundHoles: { include: { hole: { select: { par: true } } } } },
    });

    const scoredRounds = rounds.filter((r) => r.roundHoles.length > 0);
    if (scoredRounds.length === 0) { res.json({ hasData: false }); return; }

    // Penalties are counted per round, so this keeps the round grouping that
    // the flattened `allHoles` below throws away.
    const roundsOfHoles = scoredRounds.map((r) =>
      r.roundHoles.map((rh) => ({
        par: rh.hole.par,
        strokes: rh.strokes,
        putts: rh.putts,
        teeShotDirection: rh.teeShotDirection,
        approachResult: rh.approachResult,
        sandShots: rh.sandShots,
        penalties: rh.penalties,
      })),
    );

    const allHoles = scoredRounds.flatMap((r) =>
      r.roundHoles.map((rh) => ({ ...rh, holePar: rh.hole.par }))
    );

    // Shared metric maths (lib/roundMetrics) — same definitions as /stats
    // and /trends, so insights can never disagree with the other endpoints.
    const metricHoles = allHoles.map((rh) => ({
      par: rh.holePar,
      strokes: rh.strokes,
      putts: rh.putts,
      teeShotDirection: rh.teeShotDirection,
      approachResult: rh.approachResult,
    }));

    // Putting
    const putting = summarisePutting(metricHoles);
    const holesWithPutts = { length: putting.tracked }; // keep threshold checks below readable
    const avgPutts = putting.avgPutts;
    const threePuttRate = putting.threePuttRate;

    // Putting split by whether the green was hit in regulation, and penalty
    // strokes per round.
    const puttsByGir = summarisePuttingByGir(metricHoles);
    const penalties = summarisePenalties(roundsOfHoles);

    // GIR
    const approach = summariseApproach(metricHoles);
    const holesWithApproach = { length: approach.tracked };
    const girRate = approach.girRate;
    const { left: missLeft, right: missRight, short: missShort, long: missLong, total: missTotal } = approach.misses;

    // Fairway accuracy (par 4/5 only)
    const teeShots = summariseTeeShots(metricHoles);
    const holesWithTeeDir = { length: teeShots.tracked };
    const fairwayRate = teeShots.fairwayRate;

    // Per-par performance
    const parGroupStats = (par: number) => {
      const holes = allHoles.filter((rh) => rh.holePar === par);
      if (holes.length === 0) return null;
      const avg = holes.reduce((s, rh) => s + (rh.strokes - rh.holePar), 0) / holes.length;
      return { count: holes.length, averageScoreToPar: parseFloat(avg.toFixed(2)) };
    };

    // Double bogey rate
    const doublePlusCount = allHoles.filter((rh) => rh.strokes - rh.holePar >= 2).length;
    const doublePlusRate = allHoles.length > 0 ? doublePlusCount / allHoles.length : null;

    const par3Stats = parGroupStats(3);
    const par4Stats = parGroupStats(4);
    const par5Stats = parGroupStats(5);

    // Build suggestions
    const suggestions: Array<{ area: string; message: string; severity: "high" | "medium" | "low" }> = [];

    if (avgPutts != null && holesWithPutts.length >= 9) {
      if (avgPutts >= 2.1)
        suggestions.push({ area: "Putting", message: `You average ${avgPutts.toFixed(1)} putts per hole. Focus on lag putting — leave yourself inside 3 feet on long putts.`, severity: avgPutts >= 2.3 ? "high" : "medium" });
      else if (avgPutts < 1.8)
        suggestions.push({ area: "Putting", message: `Your putting is a strength at ${avgPutts.toFixed(1)} avg putts per hole.`, severity: "low" });
    }

    if (threePuttRate != null && threePuttRate >= 0.15 && holesWithPutts.length >= 9)
      suggestions.push({ area: "Lag Putting", message: `You 3-putt ${(threePuttRate * 100).toFixed(0)}% of holes. Work on distance control — get approach putts within tap-in range.`, severity: threePuttRate >= 0.25 ? "high" : "medium" });

    if (girRate != null && holesWithApproach.length >= 9) {
      if (girRate < 0.35)
        suggestions.push({ area: "Approach Play", message: `GIR rate of ${(girRate * 100).toFixed(0)}% is low. Focus on consistent ball striking and club selection to give yourself birdie looks.`, severity: girRate < 0.2 ? "high" : "medium" });
      else if (girRate >= 0.6)
        suggestions.push({ area: "Approach Play", message: `Excellent — ${(girRate * 100).toFixed(0)}% GIR rate. Your iron play is giving you plenty of birdie chances.`, severity: "low" });
    }

    if (missTotal >= 5) {
      if (missShort > missTotal * 0.5)
        suggestions.push({ area: "Club Selection", message: `${(missShort / missTotal * 100).toFixed(0)}% of approach misses are short. Take one extra club — most amateurs underestimate yardage.`, severity: "medium" });
      else if (missLong > missTotal * 0.4)
        suggestions.push({ area: "Club Selection", message: `${(missLong / missTotal * 100).toFixed(0)}% of misses go long. Be precise with club selection, especially into elevated greens.`, severity: "medium" });
      else if (missLeft > missTotal * 0.5)
        suggestions.push({ area: "Shot Shape", message: `${(missLeft / missTotal * 100).toFixed(0)}% of approach misses are left — possible hook/draw bias. Work on face angle at impact.`, severity: "medium" });
      else if (missRight > missTotal * 0.5)
        suggestions.push({ area: "Shot Shape", message: `${(missRight / missTotal * 100).toFixed(0)}% of approach misses are right — possible slice/fade bias. Check your grip and swing path.`, severity: "medium" });
    }

    if (fairwayRate != null && holesWithTeeDir.length >= 6 && fairwayRate < 0.4)
      suggestions.push({ area: "Tee Shot Accuracy", message: `Fairways hit: ${(fairwayRate * 100).toFixed(0)}%. Consider using an iron or hybrid off the tee on tighter holes to improve position.`, severity: fairwayRate < 0.25 ? "high" : "medium" });

    if (doublePlusRate != null && allHoles.length >= 18 && doublePlusRate >= 0.2)
      suggestions.push({ area: "Damage Limitation", message: `${(doublePlusRate * 100).toFixed(0)}% of holes end in double bogey or worse. Prioritise getting back in play when in trouble rather than going for low-percentage hero shots.`, severity: doublePlusRate >= 0.3 ? "high" : "medium" });

    if (par5Stats && par5Stats.count >= 5 && par5Stats.averageScoreToPar > 1.5)
      suggestions.push({ area: "Par 5 Strategy", message: `Averaging +${par5Stats.averageScoreToPar} on par 5s. Lay up to your favourite yardage rather than trying to reach in two — position beats power.`, severity: "medium" });

    if (par3Stats && par4Stats && par3Stats.count >= 5 && par4Stats.count >= 5 && par3Stats.averageScoreToPar > par4Stats.averageScoreToPar + 0.3)
      suggestions.push({ area: "Par 3 Performance", message: `Par 3 average (+${par3Stats.averageScoreToPar.toFixed(1)}) is worse than par 4s (+${par4Stats.averageScoreToPar.toFixed(1)}). Focus on committing to the right club and hitting the green.`, severity: "medium" });

    suggestions.sort((a, b) =>
      a.severity === "high" && b.severity !== "high" ? -1
      : b.severity === "high" && a.severity !== "high" ? 1
      : a.severity === "medium" && b.severity === "low" ? -1
      : b.severity === "medium" && a.severity === "low" ? 1 : 0
    );

    res.json({
      hasData: true,
      dataPoints: allHoles.length,
      metrics: {
        avgPutts: avgPutts != null ? parseFloat(avgPutts.toFixed(2)) : null,
        threePuttRate: threePuttRate != null ? parseFloat(threePuttRate.toFixed(2)) : null,
        puttsPerGir: puttsByGir.puttsPerGir != null ? parseFloat(puttsByGir.puttsPerGir.toFixed(2)) : null,
        puttsPerNonGir: puttsByGir.puttsPerNonGir != null ? parseFloat(puttsByGir.puttsPerNonGir.toFixed(2)) : null,
        girHolesWithPutts: puttsByGir.girHoles,
        nonGirHolesWithPutts: puttsByGir.nonGirHoles,
        penaltiesPerRound: penalties.penaltiesPerRound != null ? parseFloat(penalties.penaltiesPerRound.toFixed(2)) : null,
        penaltyRoundsTracked: penalties.roundsTracked,
        girRate: girRate != null ? parseFloat(girRate.toFixed(2)) : null,
        fairwayRate: fairwayRate != null ? parseFloat(fairwayRate.toFixed(2)) : null,
        doublePlusRate: doublePlusRate != null ? parseFloat(doublePlusRate.toFixed(2)) : null,
        par3: par3Stats,
        par4: par4Stats,
        par5: par5Stats,
        approachMisses: missTotal > 0 ? { left: missLeft, right: missRight, short: missShort, long: missLong, total: missTotal } : null,
      },
      suggestions,
    });
  } catch (err) {
    console.error("GET /rounds/insights error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /rounds/strokes-gained — simplified strokes-gained analytics
// Must be defined before /:id.
//
// requireAuth is applied router-wide above (router.use(requireAuth)).
// requireFeature('strokesGained') is wired here per the gating scaffolding —
// the feature is FREE today so the middleware is a no-op, but flipping the
// tier in lib/features.ts starts enforcing with no further changes.
//
// See lib/strokesGained.ts for the model and its assumptions. This handler
// only: (1) picks the user's handicap band, (2) runs the model per round,
// (3) averages categories across the window and reports data completeness.
router.get(
  "/strokes-gained",
  requireFeature("strokesGained"),
  async (req: AuthRequest, res: Response) => {
    try {
      // Analyse a bounded recent window so the result reflects current form
      // and the query stays cheap. 20 matches the WHS handicap window.
      const RECENT_ROUNDS_WINDOW = 20;

      const [rounds, linkedHandicap] = await Promise.all([
        prisma.round.findMany({
          where: { userId: req.userId! },
          include: {
            course: {
              select: {
                name: true,
                courseRating: true,
                slopeRating: true,
                _count: { select: { holes: true } },
              },
            },
            roundHoles: {
              select: {
                strokes: true,
                putts: true,
                teeShotDirection: true,
                approachResult: true,
                sandShots: true,
                hole: { select: { par: true } },
              },
            },
          },
          orderBy: { playedAt: "desc" },
          take: RECENT_ROUNDS_WINDOW,
        }),
        prisma.linkedHandicap.findUnique({ where: { userId: req.userId! } }),
      ]);

      const scoredRounds = rounds.filter((r) => r.roundHoles.length > 0);
      if (scoredRounds.length === 0) {
        res.json({ hasData: false });
        return;
      }

      // Baseline band: prefer the official linked handicap; otherwise compute
      // from the same rounds (course rating/slope permitting); otherwise the
      // model falls back to the "mid" band.
      const handicapIndex =
        linkedHandicap?.handicapIndex ??
        calculateHandicapIndex(calculateDifferentials(rounds))?.handicapIndex ??
        null;
      const band = bandForHandicap(handicapIndex);

      // Per-round series, oldest → newest (chart-friendly).
      const series = scoredRounds
        .slice()
        .reverse()
        .map((r) => {
          const sg = computeRoundStrokesGained(
            r.roundHoles.map((rh) => ({
              par: rh.hole.par,
              strokes: rh.strokes,
              putts: rh.putts,
              teeShotDirection: rh.teeShotDirection,
              approachResult: rh.approachResult,
              sandShots: rh.sandShots,
            })),
            band,
          );
          return {
            roundId: r.id,
            playedAt: r.playedAt.toISOString(),
            courseName: r.course.name,
            holesPlayed: sg.holesPlayed,
            totalVsBaseline: sg.totalVsBaseline,
            offTheTee: sg.offTheTee,
            approach: sg.approach,
            aroundGreen: sg.aroundGreen,
            putting: sg.putting,
          };
        });

      const totalHoles = series.reduce((s, r) => s + r.holesPlayed, 0);

      // Per-category aggregate: average SG per round, over rounds that
      // actually tracked that category (averaging in all-null rounds would
      // bias toward zero). dataCompleteness flags sparse inputs.
      const categories = {} as Record<
        SGCategory,
        {
          averagePerRound: number | null;
          dataCompleteness: {
            trackedHoles: number;
            totalHoles: number;
            roundsWithData: number;
            sufficient: boolean;
          };
        }
      >;

      for (const cat of SG_CATEGORIES) {
        const withData = series.filter((r) => r[cat].value != null);
        const trackedHoles = series.reduce((s, r) => s + r[cat].trackedHoles, 0);
        const averagePerRound =
          withData.length > 0
            ? parseFloat(
                (
                  withData.reduce((s, r) => s + r[cat].value!, 0) /
                  withData.length
                ).toFixed(2),
              )
            : null;
        categories[cat] = {
          averagePerRound,
          dataCompleteness: {
            trackedHoles,
            totalHoles,
            roundsWithData: withData.length,
            sufficient: trackedHoles >= MIN_TRACKED_HOLES,
          },
        };
      }

      res.json({
        hasData: true,
        band,
        handicapIndex,
        roundsAnalysed: series.length,
        categories,
        series,
      });
    } catch (err) {
      console.error("GET /rounds/strokes-gained error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// GET /rounds/trends — time-trend series for one metric
// Must be defined before /:id.
//
// requireAuth is router-wide; requireFeature('trends') is FREE today (no-op)
// but flips to enforcing the moment the tier changes in lib/features.ts.
//
// Semantics (see lib/roundMetrics.ts for the maths):
//   • Series is chronological by playedAt. Rounds that didn't track the
//     requested metric are excluded — they carry no signal for it.
//   • rollingAvg is a trailing mean over `window` rounds, null until full.
//   • delta compares the mean of the last `window` rounds vs the `window`
//     before them; null until 2×window rounds exist.
router.get(
  "/trends",
  requireFeature("trends"),
  async (req: AuthRequest, res: Response) => {
    const querySchema = z.object({
      metric: z.enum(TREND_METRICS),
      window: z.coerce.number().int().min(2).max(20).default(5),
    });
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }
    const { metric, window } = parsed.data;
    const config = TREND_METRIC_CONFIG[metric];

    try {
      // Single findMany: every metric is derived from the same hole rows.
      // course rating/slope is only consumed for the strokesGained band
      // fallback, but selecting it is cheaper than a second query shape.
      const [rounds, linkedHandicap] = await Promise.all([
        prisma.round.findMany({
          where: { userId: req.userId! },
          include: {
            course: {
              select: {
                name: true,
                courseRating: true,
                slopeRating: true,
                _count: { select: { holes: true } },
              },
            },
            roundHoles: {
              select: {
                strokes: true,
                putts: true,
                teeShotDirection: true,
                approachResult: true,
                sandShots: true,
                hole: { select: { par: true } },
              },
            },
          },
          orderBy: { playedAt: "asc" },
        }),
        // Band only matters for the strokesGained metric, but the lookup is
        // a PK read — simpler to always fetch than to branch.
        prisma.linkedHandicap.findUnique({ where: { userId: req.userId! } }),
      ]);

      const scoredRounds = rounds.filter((r) => r.roundHoles.length > 0);
      if (scoredRounds.length === 0) {
        res.json({ hasData: false, metric, window });
        return;
      }

      const handicapIndex =
        linkedHandicap?.handicapIndex ??
        calculateHandicapIndex(calculateDifferentials(rounds))?.handicapIndex ??
        null;
      const band = bandForHandicap(handicapIndex);

      const round2 = (n: number) =>
        parseFloat(n.toFixed(config.decimals));

      // Per-round metric values, chronological; drop rounds without data.
      const points = scoredRounds
        .map((r) => ({
          roundId: r.id,
          playedAt: r.playedAt.toISOString(),
          courseName: r.course.name,
          value: roundMetricValue(
            metric,
            r.roundHoles.map((rh) => ({
              par: rh.hole.par,
              strokes: rh.strokes,
              putts: rh.putts,
              teeShotDirection: rh.teeShotDirection,
              approachResult: rh.approachResult,
              sandShots: rh.sandShots,
            })),
            band,
          ),
        }))
        .filter((p): p is typeof p & { value: number } => p.value != null);

      const values = points.map((p) => p.value);
      const rolling = rollingAverage(values, window);
      const series = points.map((p, i) => ({
        roundId: p.roundId,
        playedAt: p.playedAt,
        courseName: p.courseName,
        value: round2(p.value),
        rollingAvg: rolling[i] != null ? round2(rolling[i]!) : null,
      }));

      const rawDelta = computeTrendDelta(values, window, config);
      const delta = rawDelta
        ? {
            value: round2(rawDelta.value),
            magnitude: round2(rawDelta.magnitude),
            direction: rawDelta.direction,
            lastAvg: round2(rawDelta.lastAvg),
            previousAvg: round2(rawDelta.previousAvg),
            window: rawDelta.window,
          }
        : null;

      res.json({
        hasData: series.length > 0,
        metric,
        window,
        higherIsBetter: config.higherIsBetter,
        roundsAnalysed: series.length,
        totalRounds: scoredRounds.length,
        series,
        delta,
      });
    } catch (err) {
      console.error("GET /rounds/trends error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// GET /rounds/benchmarks — anonymised peer benchmarking
// Must be defined before /:id.
//
// requireAuth is router-wide; requireFeature('benchmarks') is FREE today
// (no-op) but flips to enforcing the moment the tier changes in
// lib/features.ts — same scaffolding as strokes-gained and trends.
//
// PRIVACY: the response contains ONLY (a) the requesting user's own values,
// computed from their own rounds, and (b) aggregate cohort statistics
// (percentile, median, sample size) read from BenchmarkSnapshot rows. No
// other user's identity, rounds or raw values are ever queried into this
// handler, so they cannot leak. See lib/benchmarks.ts for the full model.
//
// Cohort = users in the same 5-stroke WHS handicap band; falls back to the
// "all users" cohort when the band has < MIN_BAND_SAMPLE users (or the user
// has no handicap index yet). Snapshots refresh lazily on a TTL — no cron.
router.get(
  "/benchmarks",
  requireFeature("benchmarks"),
  async (req: AuthRequest, res: Response) => {
    try {
      const [rounds, linkedHandicap] = await Promise.all([
        prisma.round.findMany({
          where: { userId: req.userId! },
          orderBy: { playedAt: "desc" },
          take: BENCHMARK_ROUND_WINDOW,
          select: {
            id: true,
            playedAt: true,
            course: {
              select: {
                name: true,
                courseRating: true,
                slopeRating: true,
                _count: { select: { holes: true } },
              },
            },
            roundHoles: {
              select: {
                strokes: true,
                putts: true,
                teeShotDirection: true,
                approachResult: true,
                sandShots: true,
                hole: { select: { par: true } },
              },
            },
          },
        }),
        prisma.linkedHandicap.findUnique({ where: { userId: req.userId! } }),
      ]);

      const scoredRounds = rounds.filter((r) => r.roundHoles.length > 0);
      if (scoredRounds.length === 0) {
        res.json({ hasData: false });
        return;
      }

      const handicapIndex =
        linkedHandicap?.handicapIndex ??
        calculateHandicapIndex(calculateDifferentials(rounds))
          ?.handicapIndex ??
        null;
      const sgBand = bandForHandicap(handicapIndex);
      const bandKey = bandKeyForIndex(handicapIndex);

      // The user's own values — computed from their own rounds only.
      const ownValues = userMetricValues(
        scoredRounds.map((r) => ({
          holes: r.roundHoles.map((rh) => ({
            par: rh.hole.par,
            strokes: rh.strokes,
            putts: rh.putts,
            teeShotDirection: rh.teeShotDirection,
            approachResult: rh.approachResult,
            sandShots: rh.sandShots,
          })),
        })),
        sgBand,
      );

      // Lazily rebuild cohort snapshots when the TTL has expired, then read
      // only the two cohorts this user can belong to.
      await ensureFreshSnapshots(prisma);
      const snapshotRows = await prisma.benchmarkSnapshot.findMany({
        where: {
          band: { in: bandKey ? [bandKey, ALL_BAND] : [ALL_BAND] },
          metric: { in: [...BENCHMARK_METRICS] },
        },
      });
      const snapshotFor = (band: string, metric: BenchmarkMetric) => {
        const row = snapshotRows.find(
          (s) => s.band === band && s.metric === metric,
        );
        if (!row) return null;
        return {
          band: row.band,
          summary: row.summary as unknown as SnapshotSummary,
          sampleSize: row.sampleSize,
        };
      };

      const metrics = BENCHMARK_METRICS.map((metric) => {
        const config = BENCHMARK_METRIC_CONFIG[metric];
        const value = ownValues[metric];
        const roundVal = (n: number) => parseFloat(n.toFixed(config.decimals));

        const base = {
          key: metric,
          label: config.label,
          lowerIsBetter: config.lowerIsBetter,
          value: value != null ? roundVal(value) : null,
        };

        const chosen = chooseCohort(
          bandKey ? snapshotFor(bandKey, metric) : null,
          snapshotFor(ALL_BAND, metric),
        );
        if (value == null || chosen == null) {
          // Untracked metric, or cohort too small for a safe, meaningful
          // percentile — return the user's own value (if any) and nothing else.
          return {
            ...base,
            percentile: null,
            cohortMedian: null,
            sampleSize: chosen?.snapshot.sampleSize ?? 0,
            cohort: null,
            cohortLabel: null,
          };
        }

        const { snapshot, cohort } = chosen;
        return {
          ...base,
          // "You're ahead of P% of the cohort" — higher is always better,
          // clamped to [5, 95] (we never claim sharper than top/bottom 5%).
          percentile: betterThanPercentile(
            snapshot.summary,
            value,
            config.lowerIsBetter,
          ),
          cohortMedian: roundVal(snapshot.summary.percentiles["50"]),
          sampleSize: snapshot.sampleSize,
          cohort,
          cohortLabel: bandLabel(snapshot.band),
        };
      });

      res.json({
        hasData: metrics.some((m) => m.percentile != null),
        handicapIndex,
        band: bandKey,
        roundsAnalysed: scoredRounds.length,
        metrics,
      });
    } catch (err) {
      console.error("GET /rounds/benchmarks error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// DELETE /rounds/:id — delete a round and all its scores
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid round ID" });
    return;
  }

  try {
    const round = await prisma.round.findUnique({ where: { id } });
    if (!round) {
      res.status(404).json({ error: "Round not found" });
      return;
    }
    if (round.userId !== req.userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await prisma.round.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    console.error("DELETE /rounds/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /rounds/:id — single round detail
// PUT /rounds/:id/partners — replace the set of playing partners for a round.
// Only the round owner can set partners. Partners must be accepted friends.
router.put("/:id/partners", async (req: AuthRequest, res: Response) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid round ID" });
    return;
  }

  const schema = z.object({
    userIds: z.array(z.number().int().positive()).max(7),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    sendValidationError(res, result.error);
    return;
  }

  const userId = req.userId!;
  const requestedIds = Array.from(new Set(result.data.userIds.filter((id) => id !== userId)));

  try {
    const round = await prisma.round.findUnique({ where: { id }, select: { userId: true } });
    if (!round) {
      res.status(404).json({ error: "Round not found" });
      return;
    }
    if (round.userId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Restrict to accepted friends (and exclude blocked relationships)
    let validIds: number[] = [];
    if (requestedIds.length > 0) {
      const friendships = await prisma.friendship.findMany({
        where: {
          OR: [{ requesterId: userId }, { addresseeId: userId }],
        },
        select: { requesterId: true, addresseeId: true, status: true },
      });
      const friendIds = new Set<number>();
      for (const f of friendships) {
        if (f.status !== "ACCEPTED") continue;
        friendIds.add(f.requesterId === userId ? f.addresseeId : f.requesterId);
      }
      validIds = requestedIds.filter((id) => friendIds.has(id));
    }

    // Identify newly-added partners (for notification)
    const existing = await prisma.roundPartner.findMany({
      where: { roundId: id },
      select: { userId: true },
    });
    const existingIds = new Set(existing.map((p) => p.userId));
    const newlyAdded = validIds.filter((id) => !existingIds.has(id));

    // Replace set atomically
    await prisma.$transaction([
      prisma.roundPartner.deleteMany({ where: { roundId: id } }),
      ...(validIds.length > 0
        ? [prisma.roundPartner.createMany({
            data: validIds.map((partnerId) => ({ roundId: id, userId: partnerId })),
          })]
        : []),
    ]);

    // Fire-and-forget push to newly tagged users
    if (newlyAdded.length > 0) {
      (async () => {
        const owner = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
        const courseRow = await prisma.round.findUnique({
          where: { id },
          select: { course: { select: { name: true } } },
        });
        const courseName = courseRow?.course?.name?.replace(/\s*—.*$/, "") ?? "a round";
        for (const partnerId of newlyAdded) {
          sendPushToUser(
            partnerId,
            "You were tagged in a round",
            `${owner?.name ?? "Someone"} tagged you in their round at ${courseName}`,
            "/feed",
          ).catch(() => {});
        }
      })().catch((e) => console.error("partner-tag notification error:", e));
    }

    // Return the updated partners list with names
    const partners = await prisma.roundPartner.findMany({
      where: { roundId: id },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });

    res.json({ partners: partners.map((p) => ({ id: p.user.id, name: p.user.name })) });
  } catch (err) {
    console.error("PUT /rounds/:id/partners error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req: AuthRequest, res: Response) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid round ID" });
    return;
  }

  try {
    const round = await prisma.round.findUnique({
      where: { id },
      include: {
        course: { include: { holes: { orderBy: { number: "asc" } } } },
        roundHoles: {
          include: { hole: true },
          orderBy: { hole: { number: "asc" } },
        },
        partners: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!round) {
      res.status(404).json({ error: "Round not found" });
      return;
    }
    if (round.userId !== req.userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Stableford context: course handicap + per-hole strokes received, so the
    // scorecard can render live points as holes are scored. With no handicap
    // this degrades to gross Stableford (0 strokes received everywhere).
    const handicapIndex = await getUserHandicapIndex(req.userId!);
    const courseHandicap = courseHandicapFrom(handicapIndex, round.course.slopeRating);
    const strokesReceived = allocateStrokesReceived(
      round.course.holes.map((h) => ({
        number: h.number,
        par: h.par,
        distance: h.distance,
        strokeIndex: h.strokeIndex,
      })),
      courseHandicap,
    );

    res.json({
      ...round,
      partners: round.partners.map((p) => ({ id: p.user.id, name: p.user.name })),
      stableford: {
        courseHandicap,
        usingOfficialStrokeIndex: round.course.holes.every((h) => h.strokeIndex != null),
        strokesReceived: Object.fromEntries(strokesReceived),
      },
    });
  } catch (err) {
    console.error("GET /rounds/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
