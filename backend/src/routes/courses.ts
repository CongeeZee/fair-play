import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();

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
