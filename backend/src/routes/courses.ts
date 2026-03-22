import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();

// Simple in-memory TTL cache to avoid hammering golfcourseapi.com
// (free tier: 300 req/day). Results are stable for hours.
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const apiCache = new Map<string, { data: unknown; expiresAt: number }>();

function cacheGet(key: string): unknown | null {
  const entry = apiCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.data;
}
function cacheSet(key: string, data: unknown) {
  apiCache.set(key, { data, expiresAt: Date.now() + TTL_MS });
}

const holeSchema = z.object({
  number: z.number().int().min(1).max(18),
  par: z.number().int().min(3).max(5),
  distance: z.number().int().positive(),
});

const courseSchema = z.object({
  name: z.string().min(1, "Course name is required"),
  holes: z
    .array(holeSchema)
    .min(1)
    .max(18)
    .refine(
      (holes) => {
        const numbers = holes.map((h) => h.number);
        return new Set(numbers).size === numbers.length;
      },
      { message: "Hole numbers must be unique" }
    ),
});

// GET /courses/tees/:externalId — return available tee sets for a course; must be before /:id
router.get("/tees/:externalId", async (req: Request, res: Response) => {
  const { externalId } = req.params;
  const cacheKey = `tees:${externalId}`;

  const cached = cacheGet(cacheKey);
  if (cached) { res.json(cached); return; }

  const apiKey = process.env.GOLF_API_KEY;
  if (!apiKey) { res.status(503).json({ error: "Golf API not configured" }); return; }

  try {
    const response = await fetch(
      `https://api.golfcourseapi.com/v1/courses/${externalId}`,
      { headers: { Authorization: `Key ${apiKey}` } }
    );
    if (!response.ok) { res.status(502).json({ error: "External API error" }); return; }

    type TeeSet = { tee_name: string; total_yards: number; par_total: number };
    type CourseResp = {
      course_name: string; club_name?: string;
      tees?: { male?: TeeSet[]; female?: TeeSet[] };
    };
    const { course } = (await response.json()) as { course: CourseResp };

    const tees = [
      ...(course.tees?.male ?? []).map((t) => ({ name: t.tee_name, gender: "male", totalYards: t.total_yards, parTotal: t.par_total })),
      ...(course.tees?.female ?? []).map((t) => ({ name: t.tee_name, gender: "female", totalYards: t.total_yards, parTotal: t.par_total })),
    ];

    const result = { courseName: course.course_name, clubName: course.club_name, tees };
    cacheSet(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error("GET /courses/tees error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /courses/search?q= — proxy to golfcourseapi.com; must be before /:id
router.get("/search", async (req: Request, res: Response) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q.length < 2) {
    res.json([]);
    return;
  }

  const cacheKey = `search:${q.toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) { res.json(cached); return; }

  const apiKey = process.env.GOLF_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "Golf API not configured" });
    return;
  }

  try {
    const response = await fetch(
      `https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(q)}`,
      { headers: { Authorization: `Key ${apiKey}` } }
    );
    if (!response.ok) {
      res.status(502).json({ error: "External API error" });
      return;
    }
    const data = (await response.json()) as { courses?: unknown[] };
    const result = data.courses ?? [];
    cacheSet(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error("GET /courses/search error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /courses?search=
// Public — no auth required, users need to browse before logging in
router.get("/", async (req: Request, res: Response) => {
  const search = typeof req.query.search === "string" ? req.query.search : "";

  try {
    const courses = await prisma.course.findMany({
      where: search
        ? { name: { contains: search, mode: "insensitive" } }
        : undefined,
      include: {
        holes: { orderBy: { number: "asc" } },
      },
      orderBy: { name: "asc" },
      // Cap results — a blank search shouldn't dump the entire table
      take: 50,
    });

    res.json(courses);
  } catch (err) {
    console.error("GET /courses error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /courses/:id
router.get("/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid course ID" });
    return;
  }

  try {
    const course = await prisma.course.findUnique({
      where: { id },
      include: { holes: { orderBy: { number: "asc" } } },
    });

    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }

    res.json(course);
  } catch (err) {
    console.error("GET /courses/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /courses — protected; any logged-in user can submit a course
router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  const result = courseSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.flatten().fieldErrors });
    return;
  }

  const { name, holes } = result.data;

  try {
    const course = await prisma.course.create({
      data: {
        name,
        holes: {
          create: holes.map((h) => ({
            number: h.number,
            par: h.par,
            distance: h.distance,
          })),
        },
      },
      include: { holes: { orderBy: { number: "asc" } } },
    });

    res.status(201).json(course);
  } catch (err) {
    console.error("POST /courses error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
