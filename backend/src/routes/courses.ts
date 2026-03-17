import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// POST /courses
router.post("/", async (req: Request, res: Response) => {
  const { name, holes } = req.body;

  const course = await prisma.course.create({
    data: {
      name,
      distance: holes.reduce((sum: number, h: any) => sum + h.distance, 0),
      holes: { create: holes },
    },
    include: { holes: true },
  });

  res.status(201).json(course);
});

// GET /courses
router.get("/", async (req: Request, res: Response) => {
  const courses = await prisma.course.findMany({ include: { holes: true } });
  res.json(courses);
});

// GET /courses/:id
router.get("/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);

  const course = await prisma.course.findUnique({
    where: { id },
    include: { holes: true },
  });

  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  res.json(course);
});

export default router;
