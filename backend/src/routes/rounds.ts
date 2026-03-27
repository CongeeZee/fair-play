import { Router, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();

// All round routes require a valid JWT
router.use(requireAuth);

// Fetch a course from golfcourseapi.com and upsert it into our DB.
// Returns the local Course record (with holes).
async function importExternalCourse(externalId: string, teeName?: string) {
  // Short-circuit: if we know the tee name we can build the exact DB key
  // and skip the external API call entirely if the course is already cached.
  if (teeName) {
    const dbExternalId = `${externalId}_${teeName}`;
    const existing = await prisma.course.findUnique({
      where: { externalId: dbExternalId },
      include: { holes: { orderBy: { number: "asc" } } },
    });
    if (existing) return existing;
  }

  const apiKey = process.env.GOLF_API_KEY;
  if (!apiKey) throw new Error("Golf API not configured");

  const response = await fetch(
    `https://api.golfcourseapi.com/v1/courses/${externalId}`,
    { headers: { Authorization: `Key ${apiKey}` } }
  );
  if (!response.ok) throw new Error(`External API returned ${response.status}`);

  type ExternalHole = { par: number; yardage: number };
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

  const allTees = [...(data.tees?.male ?? []), ...(data.tees?.female ?? [])];
  const teeSet = teeName
    ? allTees.find((t) => t.tee_name === teeName)
    : (data.tees?.male?.[0] ?? data.tees?.female?.[0]);
  if (!teeSet || !teeSet.holes?.length) {
    throw new Error("No hole data available for this course");
  }

  const baseName = data.club_name && data.club_name !== data.course_name
    ? `${data.course_name} (${data.club_name})`
    : data.course_name;
  const courseName = `${baseName} — ${teeSet.tee_name} Tees`;

  // Include tee name in the key so each tee set is stored as its own course
  const dbExternalId = `${data.id}_${teeSet.tee_name}`;

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
      playedAt: z.coerce.date().optional(),
    })
    .refine((d) => d.courseId != null || d.externalCourseId != null, {
      message: "Either courseId or externalCourseId is required",
    });

  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.flatten().fieldErrors });
    return;
  }

  const { courseId, externalCourseId, teeName, playedAt } = result.data;

  try {
    let resolvedCourseId: number;

    if (externalCourseId) {
      const course = await importExternalCourse(externalCourseId, teeName);
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
    putts: z.number().int().min(0).max(20).optional(),
    teeShotDirection: z.enum(["fairway", "left", "right", "penalty"]).optional(),
    sandShots: z.number().int().min(0).max(20).optional(),
    penalties: z.number().int().min(0).max(20).optional(),
    hazards: z.number().int().min(0).max(20).optional(),
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

    const { strokes, putts, teeShotDirection, sandShots, penalties, hazards } = result.data;
    const holeData = { strokes, putts, teeShotDirection, sandShots, penalties, hazards };

    // Upsert — re-submitting a score corrects it rather than errors
    const roundHole = await prisma.roundHole.upsert({
      where: { roundId_holeId: { roundId, holeId } },
      create: { roundId, holeId, ...holeData },
      update: holeData,
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

// GET /rounds/handicap — World Handicap System index for the current user
// Must be defined before /:id
router.get("/handicap", async (req: AuthRequest, res: Response) => {
  try {
    // WHS uses the most recent 20 rounds
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
        roundHoles: { include: { hole: { select: { par: true } } } },
      },
      orderBy: { playedAt: "desc" },
      take: 20,
    });

    // Only use rounds that have rating/slope data and are fully scored
    const eligible = rounds.filter((r) => {
      const totalHoles = r.course._count.holes;
      return (
        r.roundHoles.length === totalHoles && totalHoles > 0 &&
        r.course.courseRating != null &&
        r.course.slopeRating != null
      );
    });

    if (eligible.length < 3) {
      res.json({
        handicapIndex: null,
        totalEligible: eligible.length,
        minimumRequired: 3,
        differentials: [],
      });
      return;
    }

    // Score differential = (113 / slope) × (gross - courseRating)
    const differentials = eligible.map((r) => {
      const gross = r.roundHoles.reduce((s, rh) => s + rh.strokes, 0);
      const diff = (113 / r.course.slopeRating!) * (gross - r.course.courseRating!);
      return {
        roundId: r.id,
        playedAt: r.playedAt,
        courseName: r.course.name,
        gross,
        courseRating: r.course.courseRating!,
        slopeRating: r.course.slopeRating!,
        differential: parseFloat(diff.toFixed(1)),
      };
    });

    // WHS lookup table: [minRounds, maxRounds, differentialsToUse, adjustment]
    const WHS_TABLE: [number, number, number, number][] = [
      [3, 3, 1, -2.0],
      [4, 4, 1, -1.0],
      [5, 5, 1, 0],
      [6, 6, 2, -1.0],
      [7, 8, 2, 0],
      [9, 11, 3, 0],
      [12, 14, 4, 0],
      [15, 16, 5, 0],
      [17, 18, 6, 0],
      [19, 19, 7, 0],
      [20, 20, 8, 0],
    ];

    const n = differentials.length;
    const [, , use, adj] = WHS_TABLE.find(([min, max]) => n >= min && n <= max)!;

    const sorted = [...differentials].sort((a, b) => a.differential - b.differential);
    const used = sorted.slice(0, use);
    const avg = used.reduce((s, d) => s + d.differential, 0) / use;

    // Apply 96% factor and truncate (not round) to 1 decimal — WHS spec
    const raw = (avg + adj) * 0.96;
    const handicapIndex = Math.trunc(raw * 10) / 10;
    // WHS cap: 54.0
    const cappedIndex = Math.min(handicapIndex, 54.0);

    const usedIds = new Set(used.map((d) => d.roundId));

    res.json({
      handicapIndex: cappedIndex,
      differentialsUsed: use,
      totalEligible: n,
      differentials: differentials.map((d) => ({ ...d, used: usedIds.has(d.roundId) })),
    });
  } catch (err) {
    console.error("GET /rounds/handicap error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

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
