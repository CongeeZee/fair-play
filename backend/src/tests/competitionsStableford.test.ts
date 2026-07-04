import { describe, it as itBase, expect, vi } from "vitest";
// Multiple verified users per test — bump the per-test timeout like invites.test.ts.
const it = ((name: string, fn: () => Promise<void> | void) =>
  itBase(name, fn, 90_000)) as unknown as typeof itBase;
import request from "supertest";
import { createVerifiedTestUser, createTestCourse, prisma } from "./setup";

vi.mock("../lib/email", () => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock("../middleware/rateLimiter", () => {
  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    strictLimiter: passthrough,
    moderateLimiter: passthrough,
    standardLimiter: passthrough,
    refreshLimiter: passthrough,
  };
});

vi.mock("../lib/pushNotification", () => ({
  sendPushToUser: vi.fn().mockResolvedValue(undefined),
}));

const { default: app } = await import("../app");

async function befriend(a: number, b: number) {
  await prisma.friendship.create({
    data: { requesterId: a, addresseeId: b, status: "ACCEPTED" },
  });
}

/** Create a completed round where the user shoots `toPar` relative to par on every-hole-total. */
async function completedRound(userId: number, courseId: number, perHoleOverPar: number) {
  const holes = await prisma.hole.findMany({ where: { courseId }, orderBy: { number: "asc" } });
  return prisma.round.create({
    data: {
      userId,
      courseId,
      playedAt: new Date(),
      completedAt: new Date(),
      roundHoles: {
        create: holes.map((h) => ({ holeId: h.id, strokes: h.par + perHoleOverPar })),
      },
    },
  });
}

describe("Stableford competitions", () => {
  it("creates a STABLEFORD competition", async () => {
    const creator = await createVerifiedTestUser();
    const today = new Date().toISOString().slice(0, 10);
    const nextWeek = new Date(Date.now() + 7 * 86400_000).toISOString();

    const res = await request(app)
      .post("/competitions")
      .set("Authorization", `Bearer ${creator.accessToken}`)
      .send({ name: "Society Stableford", startDate: today, endDate: nextWeek, scoringType: "STABLEFORD" });

    expect(res.status).toBe(201);
    expect(res.body.scoringType).toBe("STABLEFORD");
  });

  it("computes points on submit and ranks the leaderboard by points descending", async () => {
    const alice = await createVerifiedTestUser({ name: "Alice" });
    const bob = await createVerifiedTestUser({ name: "Bob" });
    await befriend(alice.id, bob.id);

    const course = await createTestCourse("Stableford Links", 18, { courseRating: 72, slopeRating: 113 });

    const today = new Date().toISOString().slice(0, 10);
    const nextWeek = new Date(Date.now() + 7 * 86400_000).toISOString();
    const createRes = await request(app)
      .post("/competitions")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({
        name: "Monthly Medal (Stableford)",
        courseId: course.id,
        startDate: today,
        endDate: nextWeek,
        scoringType: "STABLEFORD",
        inviteUserIds: [bob.id],
      });
    expect(createRes.status).toBe(201);
    const compId = createRes.body.id;

    await request(app)
      .post(`/competitions/${compId}/respond`)
      .set("Authorization", `Bearer ${bob.accessToken}`)
      .send({ response: "ACCEPTED" });

    // Neither player has a handicap → gross Stableford.
    // Alice: all pars → 2 pts/hole = 36. Bob: all bogeys → 1 pt/hole = 18.
    const aliceRound = await completedRound(alice.id, course.id, 0);
    const bobRound = await completedRound(bob.id, course.id, 1);

    const submitA = await request(app)
      .post(`/competitions/${compId}/submit-round`)
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ roundId: aliceRound.id });
    expect(submitA.status).toBe(201);
    expect(submitA.body.stablefordPoints).toBe(36);

    const submitB = await request(app)
      .post(`/competitions/${compId}/submit-round`)
      .set("Authorization", `Bearer ${bob.accessToken}`)
      .send({ roundId: bobRound.id });
    expect(submitB.status).toBe(201);
    expect(submitB.body.stablefordPoints).toBe(18);

    const detail = await request(app)
      .get(`/competitions/${compId}`)
      .set("Authorization", `Bearer ${alice.accessToken}`);
    expect(detail.status).toBe(200);
    const lb = detail.body.leaderboard;
    expect(lb).toHaveLength(2);
    // More points wins — Alice first despite "lower" not applying here.
    expect(lb[0].name).toBe("Alice");
    expect(lb[0].stablefordPoints).toBe(36);
    expect(lb[1].name).toBe("Bob");
    expect(lb[1].stablefordPoints).toBe(18);
  });

  it("applies handicap strokes when the player has a linked handicap", async () => {
    const carol = await createVerifiedTestUser({ name: "Carol" });
    await prisma.linkedHandicap.create({
      data: { userId: carol.id, source: "manual", handicapIndex: 18.0 },
    });

    const course = await createTestCourse("Net Stableford CC", 18, { courseRating: 72, slopeRating: 113 });

    const today = new Date().toISOString().slice(0, 10);
    const nextWeek = new Date(Date.now() + 7 * 86400_000).toISOString();
    const createRes = await request(app)
      .post("/competitions")
      .set("Authorization", `Bearer ${carol.accessToken}`)
      .send({ name: "Net Points", courseId: course.id, startDate: today, endDate: nextWeek, scoringType: "STABLEFORD" });
    const compId = createRes.body.id;

    // Course handicap 18 on slope 113 → one stroke on every hole.
    // All bogeys → net par everywhere → 36 points.
    const round = await completedRound(carol.id, course.id, 1);
    const submit = await request(app)
      .post(`/competitions/${compId}/submit-round`)
      .set("Authorization", `Bearer ${carol.accessToken}`)
      .send({ roundId: round.id });

    expect(submit.status).toBe(201);
    expect(submit.body.stablefordPoints).toBe(36);
  });
});
