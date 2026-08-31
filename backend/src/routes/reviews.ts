import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { requireVerifiedEmail } from "../middleware/requireVerifiedEmail";
import { moderateLimiter } from "../middleware/rateLimiter";

const authedRouter = Router();
const publicRouter = Router();

publicRouter.use(moderateLimiter);

authedRouter.use(requireAuth);

authedRouter.use(requireVerifiedEmail("Verify your email first"));

const reviewBodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  conditionRating: z.number().int().min(1).max(5).optional().nullable(),
  valueRating: z.number().int().min(1).max(5).optional().nullable(),
  paceRating: z.number().int().min(1).max(5).optional().nullable(),
  text: z.string().max(500).optional().nullable(),
});

// POST /rounds/:roundId/review — create a review for a completed round
authedRouter.post("/rounds/:roundId/review", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const roundId = parseInt(String(req.params.roundId), 10);
    if (isNaN(roundId)) { res.status(400).json({ error: "Invalid round ID" }); return; }

    const parsed = reviewBodySchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid review data" }); return; }

    const round = await prisma.round.findUnique({
      where: { id: roundId },
      select: { userId: true, courseId: true, completedAt: true },
    });
    if (!round) { res.status(404).json({ error: "Round not found" }); return; }
    if (round.userId !== userId) { res.status(403).json({ error: "Not authorized" }); return; }
    if (!round.completedAt) { res.status(400).json({ error: "Round is not completed" }); return; }

    const existing = await prisma.courseReview.findUnique({ where: { roundId } });
    if (existing) { res.status(409).json({ error: "Review already exists for this round" }); return; }

    const body = parsed.data;
    const review = await prisma.courseReview.create({
      data: {
        courseId: round.courseId,
        userId,
        roundId,
        rating: body.rating,
        conditionRating: body.conditionRating ?? null,
        valueRating: body.valueRating ?? null,
        paceRating: body.paceRating ?? null,
        text: body.text?.trim() || null,
      },
    });

    res.status(201).json(review);
  } catch (err) {
    console.error("POST /rounds/:roundId/review error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /rounds/:roundId/review — update existing review
authedRouter.put("/rounds/:roundId/review", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const roundId = parseInt(String(req.params.roundId), 10);
    if (isNaN(roundId)) { res.status(400).json({ error: "Invalid round ID" }); return; }

    const parsed = reviewBodySchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid review data" }); return; }

    const existing = await prisma.courseReview.findUnique({ where: { roundId } });
    if (!existing) { res.status(404).json({ error: "Review not found" }); return; }
    if (existing.userId !== userId) { res.status(403).json({ error: "Not authorized" }); return; }

    const body = parsed.data;
    const review = await prisma.courseReview.update({
      where: { id: existing.id },
      data: {
        rating: body.rating,
        conditionRating: body.conditionRating ?? null,
        valueRating: body.valueRating ?? null,
        paceRating: body.paceRating ?? null,
        text: body.text?.trim() || null,
      },
    });

    res.json(review);
  } catch (err) {
    console.error("PUT /rounds/:roundId/review error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /rounds/:roundId/review — delete a review
authedRouter.delete("/rounds/:roundId/review", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const roundId = parseInt(String(req.params.roundId), 10);
    if (isNaN(roundId)) { res.status(400).json({ error: "Invalid round ID" }); return; }

    const existing = await prisma.courseReview.findUnique({ where: { roundId } });
    if (!existing) { res.status(404).json({ error: "Review not found" }); return; }
    if (existing.userId !== userId) { res.status(403).json({ error: "Not authorized" }); return; }

    await prisma.courseReview.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /rounds/:roundId/review error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /users/:userId/reviews — reviews by a specific user (friends or self)
authedRouter.get("/users/:userId/reviews", async (req: AuthRequest, res: Response) => {
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

    const reviews = await prisma.courseReview.findMany({
      where: { userId: targetId },
      include: {
        course: { select: { id: true, name: true } },
        round: { select: { playedAt: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(
      reviews.map((r) => ({
        id: r.id,
        courseId: r.courseId,
        courseName: r.course.name,
        roundId: r.roundId,
        playedAt: r.round.playedAt,
        rating: r.rating,
        conditionRating: r.conditionRating,
        valueRating: r.valueRating,
        paceRating: r.paceRating,
        text: r.text,
        createdAt: r.createdAt,
      }))
    );
  } catch (err) {
    console.error("GET /users/:userId/reviews error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Public endpoints ─────────────────────────────────────────────────────────
// Resolve a courseId param that may be the local integer id or an externalId string.
async function resolveCourseId(param: string): Promise<number | null> {
  const asInt = parseInt(param, 10);
  if (!isNaN(asInt) && String(asInt) === param) {
    const c = await prisma.course.findUnique({ where: { id: asInt }, select: { id: true } });
    if (c) return c.id;
  }
  const byExt = await prisma.course.findUnique({ where: { externalId: param }, select: { id: true } });
  return byExt?.id ?? null;
}

// GET /courses/:courseId/reviews/summary — lightweight summary (public)
publicRouter.get("/courses/:courseId/reviews/summary", async (req: Request, res: Response) => {
  try {
    const courseId = await resolveCourseId(String(req.params.courseId));
    if (!courseId) { res.json({ averageRating: null, totalReviews: 0 }); return; }

    const agg = await prisma.courseReview.aggregate({
      where: { courseId },
      _avg: { rating: true },
      _count: { _all: true },
    });

    const total = agg._count._all;
    const avg = agg._avg.rating;
    res.json({
      averageRating: total > 0 && avg !== null ? parseFloat(avg.toFixed(2)) : null,
      totalReviews: total,
    });
  } catch (err) {
    console.error("GET /courses/:courseId/reviews/summary error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /courses/:courseId/reviews — full reviews list (public, paginated)
publicRouter.get("/courses/:courseId/reviews", async (req: Request, res: Response) => {
  try {
    const courseId = await resolveCourseId(String(req.params.courseId));
    if (!courseId) {
      res.json({
        averageRating: null,
        totalReviews: 0,
        averageCondition: null,
        averageValue: null,
        averagePace: null,
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        reviews: [],
      });
      return;
    }

    const page = Math.max(parseInt(String(req.query.page || "1"), 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || "10"), 10) || 10, 1), 50);
    const skip = (page - 1) * limit;

    const [aggAll, byRating, reviews] = await Promise.all([
      prisma.courseReview.aggregate({
        where: { courseId },
        _avg: { rating: true, conditionRating: true, valueRating: true, paceRating: true },
        _count: { _all: true, conditionRating: true, valueRating: true, paceRating: true },
      }),
      prisma.courseReview.groupBy({
        by: ["rating"],
        where: { courseId },
        _count: { _all: true },
      }),
      prisma.courseReview.findMany({
        where: { courseId },
        include: {
          user: { select: { name: true } },
          round: {
            select: {
              playedAt: true,
              roundHoles: { select: { strokes: true, hole: { select: { par: true } } } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of byRating) ratingDistribution[r.rating] = r._count._all;

    const totalReviews = aggAll._count._all;
    res.json({
      averageRating: totalReviews > 0 && aggAll._avg.rating !== null
        ? parseFloat(aggAll._avg.rating.toFixed(2)) : null,
      totalReviews,
      averageCondition: aggAll._count.conditionRating > 0 && aggAll._avg.conditionRating !== null
        ? parseFloat(aggAll._avg.conditionRating.toFixed(2)) : null,
      averageValue: aggAll._count.valueRating > 0 && aggAll._avg.valueRating !== null
        ? parseFloat(aggAll._avg.valueRating.toFixed(2)) : null,
      averagePace: aggAll._count.paceRating > 0 && aggAll._avg.paceRating !== null
        ? parseFloat(aggAll._avg.paceRating.toFixed(2)) : null,
      ratingDistribution,
      reviews: reviews.map((r) => {
        const strokes = r.round.roundHoles.reduce((s, rh) => s + rh.strokes, 0);
        const par = r.round.roundHoles.reduce((s, rh) => s + rh.hole.par, 0);
        const scoreToPar = r.round.roundHoles.length > 0 ? strokes - par : null;
        return {
          id: r.id,
          userId: r.userId,
          userName: r.user.name,
          rating: r.rating,
          conditionRating: r.conditionRating,
          valueRating: r.valueRating,
          paceRating: r.paceRating,
          text: r.text,
          playedAt: r.round.playedAt,
          scoreToPar,
          createdAt: r.createdAt,
        };
      }),
    });
  } catch (err) {
    console.error("GET /courses/:courseId/reviews error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { authedRouter, publicRouter };
