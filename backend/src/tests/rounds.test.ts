import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createVerifiedTestUser, createTestCourse, prisma } from "./setup";

// Mock email sending
vi.mock("../lib/email", () => ({
  sendVerificationEmail: vi.fn(),
}));

// Disable rate limiting for functional tests
vi.mock("../middleware/rateLimiter", () => {
  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    strictLimiter: passthrough,
    moderateLimiter: passthrough,
    standardLimiter: passthrough,
  };
});

// Mock fetch for OSM/external API calls triggered during round creation
vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("mocked")));

const { default: app } = await import("../app");

async function createRoundWithScores(
  userId: number,
  courseId: number,
  holeScores: Array<{ holeId: number; strokes: number; putts?: number }>,
) {
  const round = await prisma.round.create({
    data: {
      userId,
      courseId,
      roundHoles: {
        create: holeScores.map((s) => ({
          holeId: s.holeId,
          strokes: s.strokes,
          putts: s.putts,
        })),
      },
    },
    include: { roundHoles: true },
  });
  return round;
}

describe("POST /rounds", () => {
  it("creates a round for authenticated user", async () => {
    const user = await createVerifiedTestUser();
    const course = await createTestCourse();

    const res = await request(app)
      .post("/rounds")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ courseId: course.id });

    expect(res.status).toBe(201);
    expect(res.body.courseId).toBe(course.id);
    expect(res.body.userId).toBe(user.id);
  });

  it("returns 401 without auth", async () => {
    const res = await request(app).post("/rounds").send({ courseId: 1 });
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent course", async () => {
    const user = await createVerifiedTestUser();

    const res = await request(app)
      .post("/rounds")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ courseId: 99999 });

    expect(res.status).toBe(404);
  });
});

describe("GET /rounds", () => {
  it("returns only the authenticated user's rounds", async () => {
    const user1 = await createVerifiedTestUser({ email: "user1@test.com" });
    const user2 = await createVerifiedTestUser({ email: "user2@test.com" });
    const course = await createTestCourse();

    await prisma.round.create({ data: { userId: user1.id, courseId: course.id } });
    await prisma.round.create({ data: { userId: user1.id, courseId: course.id } });
    await prisma.round.create({ data: { userId: user2.id, courseId: course.id } });

    const res = await request(app)
      .get("/rounds")
      .set("Authorization", `Bearer ${user1.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every((r: { userId: number }) => r.userId === user1.id)).toBe(true);
  });
});

describe("GET /rounds/:id", () => {
  it("returns round details for owner", async () => {
    const user = await createVerifiedTestUser();
    const course = await createTestCourse();
    const round = await prisma.round.create({
      data: { userId: user.id, courseId: course.id },
    });

    const res = await request(app)
      .get(`/rounds/${round.id}`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(round.id);
  });

  it("returns 403 for another user's round", async () => {
    const user1 = await createVerifiedTestUser({ email: "owner@test.com" });
    const user2 = await createVerifiedTestUser({ email: "other@test.com" });
    const course = await createTestCourse();
    const round = await prisma.round.create({
      data: { userId: user1.id, courseId: course.id },
    });

    const res = await request(app)
      .get(`/rounds/${round.id}`)
      .set("Authorization", `Bearer ${user2.accessToken}`);

    expect(res.status).toBe(403);
  });
});

describe("DELETE /rounds/:id", () => {
  it("deletes own round", async () => {
    const user = await createVerifiedTestUser();
    const course = await createTestCourse();
    const round = await prisma.round.create({
      data: { userId: user.id, courseId: course.id },
    });

    const res = await request(app)
      .delete(`/rounds/${round.id}`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(res.status).toBe(204);

    const deleted = await prisma.round.findUnique({ where: { id: round.id } });
    expect(deleted).toBeNull();
  });

  it("returns 403 when deleting another user's round", async () => {
    const user1 = await createVerifiedTestUser({ email: "del-owner@test.com" });
    const user2 = await createVerifiedTestUser({ email: "del-other@test.com" });
    const course = await createTestCourse();
    const round = await prisma.round.create({
      data: { userId: user1.id, courseId: course.id },
    });

    const res = await request(app)
      .delete(`/rounds/${round.id}`)
      .set("Authorization", `Bearer ${user2.accessToken}`);

    expect(res.status).toBe(403);
  });
});

describe("PUT /rounds/:id/holes/:holeId", () => {
  it("updates score for a hole", async () => {
    const user = await createVerifiedTestUser();
    const course = await createTestCourse("Score Course", 3);
    const round = await prisma.round.create({
      data: { userId: user.id, courseId: course.id },
    });
    const hole = course.holes[0];

    const res = await request(app)
      .put(`/rounds/${round.id}/holes/${hole.id}`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ strokes: 4, putts: 2 });

    expect(res.status).toBe(200);
    expect(res.body.strokes).toBe(4);
    expect(res.body.putts).toBe(2);
  });

  it("upserts on re-submission", async () => {
    const user = await createVerifiedTestUser();
    const course = await createTestCourse("Upsert Course", 3);
    const round = await prisma.round.create({
      data: { userId: user.id, courseId: course.id },
    });
    const hole = course.holes[0];

    // First submission
    await request(app)
      .put(`/rounds/${round.id}/holes/${hole.id}`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ strokes: 5, putts: 3 });

    // Correction
    const res = await request(app)
      .put(`/rounds/${round.id}/holes/${hole.id}`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ strokes: 4, putts: 2 });

    expect(res.status).toBe(200);
    expect(res.body.strokes).toBe(4);
    expect(res.body.putts).toBe(2);
  });

  it("rejects invalid strokes", async () => {
    const user = await createVerifiedTestUser();
    const course = await createTestCourse("Invalid Course", 3);
    const round = await prisma.round.create({
      data: { userId: user.id, courseId: course.id },
    });
    const hole = course.holes[0];

    const res = await request(app)
      .put(`/rounds/${round.id}/holes/${hole.id}`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ strokes: 0 });

    expect(res.status).toBe(400);
  });

  it("returns 403 for another user's round", async () => {
    const user1 = await createVerifiedTestUser({ email: "score-owner@test.com" });
    const user2 = await createVerifiedTestUser({ email: "score-other@test.com" });
    const course = await createTestCourse("Forbidden Course", 3);
    const round = await prisma.round.create({
      data: { userId: user1.id, courseId: course.id },
    });
    const hole = course.holes[0];

    const res = await request(app)
      .put(`/rounds/${round.id}/holes/${hole.id}`)
      .set("Authorization", `Bearer ${user2.accessToken}`)
      .send({ strokes: 4 });

    expect(res.status).toBe(403);
  });
});

describe("GET /rounds/stats", () => {
  it("returns correct aggregate stats", async () => {
    const user = await createVerifiedTestUser();
    const course = await createTestCourse("Stats Course", 3);

    await createRoundWithScores(user.id, course.id, [
      { holeId: course.holes[0].id, strokes: 3, putts: 1 }, // par 3 → even
      { holeId: course.holes[1].id, strokes: 5, putts: 2 }, // par 4 → +1
      { holeId: course.holes[2].id, strokes: 5, putts: 2 }, // par 5 → even
    ]);

    const res = await request(app)
      .get("/rounds/stats")
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.roundsPlayed).toBe(1);
    expect(res.body.averageScoreToPar).toBe(1);
    expect(res.body.bestScoreToPar).toBe(1);
    expect(res.body.holeBreakdown.pars).toBe(2);
    expect(res.body.holeBreakdown.bogeys).toBe(1);
  });

  it("returns roundsPlayed 0 with no rounds", async () => {
    const user = await createVerifiedTestUser();

    const res = await request(app)
      .get("/rounds/stats")
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.roundsPlayed).toBe(0);
  });
});

describe("GET /rounds/handicap", () => {
  it("returns null handicap with fewer than 3 eligible rounds", async () => {
    const user = await createVerifiedTestUser();

    const res = await request(app)
      .get("/rounds/handicap")
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.handicapIndex).toBeNull();
    expect(res.body.minimumRequired).toBe(3);
  });

  it("calculates WHS handicap correctly with enough rounds", async () => {
    const user = await createVerifiedTestUser();
    // 18 holes, all par 4 = 72 par, rating 72, slope 113
    const course = await prisma.course.create({
      data: {
        name: "Handicap Test Course",
        courseRating: 72.0,
        slopeRating: 113,
        holes: {
          create: Array.from({ length: 18 }, (_, i) => ({
            number: i + 1,
            par: 4,
            distance: 350 + i * 10,
          })),
        },
      },
      include: { holes: { orderBy: { number: "asc" } } },
    });

    // Create 20 fully-scored rounds with varying gross scores 80-89
    for (let r = 0; r < 20; r++) {
      const grossScore = 80 + (r % 10);
      const strokesPerHole = Math.floor(grossScore / 18);
      const remainder = grossScore % 18;

      await prisma.round.create({
        data: {
          userId: user.id,
          courseId: course.id,
          playedAt: new Date(Date.now() - r * 86400000),
          roundHoles: {
            create: course.holes.map((h, i) => ({
              holeId: h.id,
              strokes: strokesPerHole + (i < remainder ? 1 : 0),
              putts: 2,
            })),
          },
        },
      });
    }

    const res = await request(app)
      .get("/rounds/handicap")
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.handicapIndex).toBeTypeOf("number");
    expect(res.body.differentialsUsed).toBe(8); // 20 rounds → best 8
    expect(res.body.totalEligible).toBe(20);
    expect(res.body.differentials).toHaveLength(20);

    // With courseRating=72, slope=113, gross 80-89:
    // differential = (113/113) × (gross - 72) = gross - 72 = 8 to 17
    // Best 8 differentials: 8,8,9,9,10,10,11,11 (each score appears twice)
    // avg = (8+8+9+9+10+10+11+11)/8 = 76/8 = 9.5
    // adjustment for 20 rounds = 0, × 0.96 = 9.12, truncated = 9.1
    expect(res.body.handicapIndex).toBe(9.1);
  }, 60000); // Increased timeout for seeding 20 rounds against remote DB
});

describe("GET /rounds/insights", () => {
  it("returns hasData false with no rounds", async () => {
    const user = await createVerifiedTestUser();

    const res = await request(app)
      .get("/rounds/insights")
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.hasData).toBe(false);
  });

  it("returns insights with scored rounds", async () => {
    const user = await createVerifiedTestUser();
    const course = await createTestCourse("Insights Course", 9);

    await createRoundWithScores(
      user.id,
      course.id,
      course.holes.map((h) => ({
        holeId: h.id,
        strokes: h.par + 1,
        putts: 2,
      })),
    );

    const res = await request(app)
      .get("/rounds/insights")
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.hasData).toBe(true);
    expect(res.body.dataPoints).toBe(9);
    expect(res.body.metrics).toBeDefined();
    expect(Array.isArray(res.body.suggestions)).toBe(true);
  });
});
