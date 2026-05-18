import { Router, Response } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import prisma from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { calculateDifferentials, calculateHandicapIndex } from "../lib/handicap";

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

    // Fetch friends' completed rounds
    const feedRounds = activeFriendIds.length > 0
      ? await prisma.round.findMany({
          where: {
            userId: { in: activeFriendIds },
            ...(cursor ? { id: { lt: cursor } } : {}),
          },
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
          },
          orderBy: { id: "desc" },
          take: limit + 1,
        })
      : [];

    const hasMore = feedRounds.length > limit;
    const page = hasMore ? feedRounds.slice(0, limit) : feedRounds;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    const feed = page
      .filter((r) => r.roundHoles.length > 0) // only completed/in-progress rounds with scores
      .map((r) => {
        const totalStrokes = r.roundHoles.reduce((s, rh) => s + rh.strokes, 0);
        const totalPar = r.roundHoles.reduce((s, rh) => s + rh.hole.par, 0);
        return {
          id: r.id,
          shareId: r.shareId,
          playerName: r.user.name,
          playedAt: r.playedAt,
          courseName: r.course.name,
          totalStrokes,
          scoreToPar: totalStrokes - totalPar,
          totalHoles: r.roundHoles.length,
          courseHoles: r.course._count.holes,
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
      },
      orderBy: { playedAt: "desc" },
    });

    let latestOwnRound = null;
    if (latestOwn && latestOwn.roundHoles.length > 0) {
      const totalStrokes = latestOwn.roundHoles.reduce((s, rh) => s + rh.strokes, 0);
      const totalPar = latestOwn.roundHoles.reduce((s, rh) => s + rh.hole.par, 0);
      latestOwnRound = {
        id: latestOwn.id,
        shareId: latestOwn.shareId,
        playedAt: latestOwn.playedAt,
        courseName: latestOwn.course.name,
        totalStrokes,
        scoreToPar: totalStrokes - totalPar,
        totalHoles: latestOwn.roundHoles.length,
        courseHoles: latestOwn.course._count.holes,
      };
    }

    res.json({ feed, nextCursor, latestOwnRound });
  } catch (err) {
    console.error("GET /rounds/feed error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── OpenStreetMap green coordinate lookup ────────────────────────────────────
// Queries the Overpass API for golf=green features near the course and matches
// them to holes using the OSM `ref` tag (hole number). Runs as a background
// fire-and-forget — never blocks course creation.

async function geocodeCourse(courseName: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const q = courseName.replace(/\s*—.*$/, ""); // strip tee suffix
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + " golf")}&format=json&limit=1`,
      { headers: { "User-Agent": "FairplayGolfApp/1.0" }, signal: AbortSignal.timeout(10000) },
    );
    if (!resp.ok) return null;
    const results = (await resp.json()) as Array<{ lat: string; lon: string }>;
    if (results.length === 0) return null;
    return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
  } catch {
    return null;
  }
}

async function lookupOSMGreens(courseId: number, lat: number, lng: number) {
  try {
    // Search for golf greens within 2 km of the course coordinates
    const query = `[out:json][timeout:15];(way["golf"="green"](around:2000,${lat},${lng});relation["golf"="green"](around:2000,${lat},${lng}););out body center;`;

    const resp = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: `data=${encodeURIComponent(query)}`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) return;

    const data = (await resp.json()) as {
      elements: Array<{
        center?: { lat: number; lon: number };
        tags?: { ref?: string };
      }>;
    };

    const greens = data.elements
      .filter((e) => e.center && !isNaN(e.center.lat) && !isNaN(e.center.lon))
      .map((e) => ({
        lat: e.center!.lat,
        lng: e.center!.lon,
        ref: e.tags?.ref ? parseInt(e.tags.ref, 10) : null,
      }))
      .filter((g) => g.ref == null || !isNaN(g.ref));

    if (greens.length === 0) return;

    // Only update holes that don't already have green coordinates
    const holes = await prisma.hole.findMany({
      where: { courseId, greenLatitude: null },
      orderBy: { number: "asc" },
    });
    if (holes.length === 0) return;

    // Strategy 1: match by OSM ref tag (hole number)
    const refMatched = new Set<number>();
    for (const hole of holes) {
      const match = greens.find((g) => g.ref === hole.number);
      if (match) {
        await prisma.hole.update({
          where: { id: hole.id },
          data: { greenLatitude: match.lat, greenLongitude: match.lng },
        });
        refMatched.add(hole.number);
      }
    }

    // Strategy 2: if no ref tags but green count matches remaining holes,
    // sort geographically and assign in order (nearest-neighbor chain)
    const unmatched = holes.filter((h) => !refMatched.has(h.number));
    const unusedGreens = greens.filter((g) => g.ref == null || !refMatched.has(g.ref));

    if (unmatched.length > 0 && unusedGreens.length === unmatched.length) {
      // Build a nearest-neighbor chain starting from the green closest to the course center
      const assigned: typeof unusedGreens = [];
      const pool = [...unusedGreens];

      // Start with the green closest to the course center (likely near hole 1)
      let current = { lat, lng };
      while (pool.length > 0) {
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < pool.length; i++) {
          const d = (pool[i].lat - current.lat) ** 2 + (pool[i].lng - current.lng) ** 2;
          if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
        const next = pool.splice(bestIdx, 1)[0];
        assigned.push(next);
        current = { lat: next.lat, lng: next.lng };
      }

      for (let i = 0; i < unmatched.length; i++) {
        await prisma.hole.update({
          where: { id: unmatched[i].id },
          data: { greenLatitude: assigned[i].lat, greenLongitude: assigned[i].lng },
        });
      }
    }

    console.log(`OSM: matched ${refMatched.size + (unmatched.length === unusedGreens.length && unmatched.length > 0 ? unmatched.length : 0)} green locations for course ${courseId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`OSM green lookup skipped (non-fatal): ${msg}`);
  }
}

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

  type ExternalHole = {
    par: number;
    yardage: number;
    green_latitude?: number;
    green_longitude?: number;
    latitude?: number;
    longitude?: number;
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
    latitude?: number;
    longitude?: number;
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
          greenLatitude: h.green_latitude ?? h.latitude ?? null,
          greenLongitude: h.green_longitude ?? h.longitude ?? null,
        })),
      },
    },
    update: {},
    include: { holes: { orderBy: { number: "asc" } } },
  });

  // Fire-and-forget: try to populate green coordinates from OpenStreetMap.
  // Uses course coordinates from the API, or geocodes the course name as fallback.
  const hasGreens = course.holes.some((h) => h.greenLatitude != null);
  if (!hasGreens) {
    (async () => {
      let loc: { lat: number; lng: number } | null = null;
      if (data.latitude != null && data.longitude != null) {
        loc = { lat: data.latitude, lng: data.longitude };
      } else {
        loc = await geocodeCourse(data.course_name + (data.club_name ? ` ${data.club_name}` : ""));
      }
      if (loc) {
        await lookupOSMGreens(course.id, loc.lat, loc.lng);
      }
    })().catch((err) => console.error("Background green lookup error:", err));
  }

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
    teeShotDistance: z.enum(["short", "on", "long"]).optional(),
    approachResult: z.enum(["gir", "short", "long", "left", "right"]).optional(),
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

    const { strokes, putts, teeShotDirection, teeShotDistance, approachResult, sandShots, penalties, hazards } = result.data;
    const holeData = { strokes, putts, teeShotDirection, teeShotDistance, approachResult, sandShots, penalties, hazards };

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
      orderBy: { playedAt: "desc" },
      take: 20,
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

    const allHoles = scoredRounds.flatMap((r) =>
      r.roundHoles.map((rh) => ({ ...rh, holePar: rh.hole.par }))
    );

    // Putting
    const holesWithPutts = allHoles.filter((rh) => rh.putts != null && rh.putts > 0);
    const avgPutts = holesWithPutts.length > 0 ? holesWithPutts.reduce((s, rh) => s + rh.putts!, 0) / holesWithPutts.length : null;
    const threePuttCount = holesWithPutts.filter((rh) => rh.putts! >= 3).length;
    const threePuttRate = holesWithPutts.length > 0 ? threePuttCount / holesWithPutts.length : null;

    // GIR
    const holesWithApproach = allHoles.filter((rh) => rh.approachResult != null);
    const girCount = holesWithApproach.filter((rh) => rh.approachResult === "gir").length;
    const girRate = holesWithApproach.length > 0 ? girCount / holesWithApproach.length : null;
    const missLeft = holesWithApproach.filter((rh) => rh.approachResult === "left").length;
    const missRight = holesWithApproach.filter((rh) => rh.approachResult === "right").length;
    const missShort = holesWithApproach.filter((rh) => rh.approachResult === "short").length;
    const missLong = holesWithApproach.filter((rh) => rh.approachResult === "long").length;
    const missTotal = missLeft + missRight + missShort + missLong;

    // Fairway accuracy (par 4/5 only)
    const par45Holes = allHoles.filter((rh) => rh.holePar >= 4);
    const holesWithTeeDir = par45Holes.filter((rh) => rh.teeShotDirection != null);
    const fairwaysHit = holesWithTeeDir.filter((rh) => rh.teeShotDirection === "fairway").length;
    const fairwayRate = holesWithTeeDir.length > 0 ? fairwaysHit / holesWithTeeDir.length : null;

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

// PUT /rounds/:id/mark-green/:holeId — save green center GPS coordinates
router.put("/:id/mark-green/:holeId", async (req: AuthRequest, res: Response) => {
  const roundId = parseInt(String(req.params.id));
  const holeId = parseInt(String(req.params.holeId));

  if (isNaN(roundId) || isNaN(holeId)) {
    res.status(400).json({ error: "Invalid round or hole ID" });
    return;
  }

  const schema = z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  });

  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.flatten().fieldErrors });
    return;
  }

  try {
    const round = await prisma.round.findUnique({ where: { id: roundId } });
    if (!round) { res.status(404).json({ error: "Round not found" }); return; }
    if (round.userId !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }

    const hole = await prisma.hole.findUnique({ where: { id: holeId } });
    if (!hole || hole.courseId !== round.courseId) {
      res.status(404).json({ error: "Hole not found on this course" });
      return;
    }

    const updated = await prisma.hole.update({
      where: { id: holeId },
      data: {
        greenLatitude: result.data.latitude,
        greenLongitude: result.data.longitude,
      },
    });

    res.json(updated);
  } catch (err) {
    console.error("PUT /rounds/:id/mark-green/:holeId error:", err);
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

    // Background: if no holes have green coordinates, try to fetch them from OSM
    const hasGreens = round.course.holes.some((h) => h.greenLatitude != null);
    if (!hasGreens && round.course.holes.length > 0) {
      (async () => {
        const loc = await geocodeCourse(round.course.name);
        if (loc) await lookupOSMGreens(round.course.id, loc.lat, loc.lng);
      })().catch(() => {});
    }

    res.json(round);
  } catch (err) {
    console.error("GET /rounds/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
