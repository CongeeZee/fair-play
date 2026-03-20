import { Router, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();

// All round routes require a valid JWT
router.use(requireAuth);

// POST /rounds — start a new round at a course
router.post("/", async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    courseId: z.number().int().positive(),
    // Allow backdating (e.g. user forgot to log during the round)
    playedAt: z.coerce.date().optional(),
  });

  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.flatten().fieldErrors });
    return;
  }

  const { courseId, playedAt } = result.data;

  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }

    const round = await prisma.round.create({
      data: {
        userId: req.userId!,
        courseId,
        playedAt: playedAt ?? new Date(),
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

// PUT /rounds/:id/holes/:holeId — submit or update a score for one hole
router.put("/:id/holes/:holeId", async (req: AuthRequest, res: Response) => {
  const roundId = parseInt(String(req.params.id));
  const holeId = parseInt(String(req.params.holeId));

  if (isNaN(roundId) || isNaN(holeId)) {
    res.status(400).json({ error: "Invalid round or hole ID" });
    return;
  }

  const schema = z.object({
    // Max 20 strokes per hole is generous but prevents garbage data
    strokes: z.number().int().min(1).max(20),
  });

  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.flatten().fieldErrors });
    return;
  }

  try {
    const round = await prisma.round.findUnique({ where: { id: roundId } });
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

    // Upsert — re-submitting a score corrects it rather than errors
    const roundHole = await prisma.roundHole.upsert({
      where: { roundId_holeId: { roundId, holeId } },
      create: { roundId, holeId, strokes: result.data.strokes },
      update: { strokes: result.data.strokes },
      include: { hole: true },
    });

    res.json(roundHole);
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
        course: { select: { id: true, name: true } },
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

    const scoresToPar = scoredRounds.map((r) => {
      const strokes = r.roundHoles.reduce((s, rh) => s + rh.strokes, 0);
      const par = r.roundHoles.reduce((s, rh) => s + rh.hole.par, 0);
      return strokes - par;
    });

    const best = Math.min(...scoresToPar);
    const worst = Math.max(...scoresToPar);
    const average = scoresToPar.reduce((a, b) => a + b, 0) / scoresToPar.length;

    // Hole-level outcome breakdown
    let eagles = 0, birdies = 0, pars = 0, bogeys = 0, doublesOrWorse = 0;
    for (const round of scoredRounds) {
      for (const rh of round.roundHoles) {
        const diff = rh.strokes - rh.hole.par;
        if (diff <= -2) eagles++;
        else if (diff === -1) birdies++;
        else if (diff === 0) pars++;
        else if (diff === 1) bogeys++;
        else doublesOrWorse++;
      }
    }

    res.json({
      roundsPlayed: rounds.length,
      averageScoreToPar: parseFloat(average.toFixed(2)),
      bestScoreToPar: best,
      worstScoreToPar: worst,
      holeBreakdown: { eagles, birdies, pars, bogeys, doublesOrWorse },
    });
  } catch (err) {
    console.error("GET /rounds/stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /rounds/:id — single round detail
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

    res.json(round);
  } catch (err) {
    console.error("GET /rounds/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
