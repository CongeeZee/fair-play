import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createVerifiedTestUser, createTestCourse, prisma } from "./setup";

vi.mock("../lib/email", () => ({ sendVerificationEmail: vi.fn(), sendPasswordResetEmail: vi.fn() }));
vi.mock("../middleware/rateLimiter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../middleware/rateLimiter")>();
  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return Object.fromEntries(Object.keys(actual).map((name) => [name, passthrough]));
});
vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("mocked")));

const { default: app } = await import("../app");

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("account settings", () => {
  it("reports sign-in methods", async () => {
    const u = await createVerifiedTestUser();
    const res = await request(app).get("/auth/account").set(auth(u.accessToken));
    expect(res.body).toMatchObject({ email: u.email, hasPassword: true, googleLinked: false });
  });

  it("changes the password only with the current one, and ends other sessions", async () => {
    const u = await createVerifiedTestUser({ password: "oldpassword1" });
    const other = await request(app).post("/auth/login").send({ email: u.email, password: "oldpassword1" });
    expect(other.status).toBe(200);

    const wrong = await request(app).post("/auth/change-password").set(auth(u.accessToken))
      .send({ currentPassword: "nope-nope", newPassword: "newpassword1" });
    expect(wrong.status).toBe(401);

    const ok = await request(app).post("/auth/change-password").set(auth(u.accessToken))
      .send({ currentPassword: "oldpassword1", newPassword: "newpassword1", refreshToken: u.refreshToken });
    expect(ok.status).toBe(200);

    // The other session's refresh token is gone; this one survives
    const otherRefresh = await request(app).post("/auth/refresh").send({ refreshToken: other.body.refreshToken });
    expect(otherRefresh.status).toBe(401);
    const mine = await request(app).post("/auth/refresh").send({ refreshToken: u.refreshToken });
    expect(mine.status).toBe(200);

    expect((await request(app).post("/auth/login").send({ email: u.email, password: "newpassword1" })).status).toBe(200);
  });

  it("lets a Google-only account set a first password without a current one", async () => {
    const u = await createVerifiedTestUser();
    await prisma.user.update({ where: { id: u.id }, data: { passwordHash: null, googleId: "g-123" } });
    const res = await request(app).post("/auth/change-password").set(auth(u.accessToken)).send({ newPassword: "brandnew123" });
    expect(res.status).toBe(200);
  });

  it("deletes the account and its rounds, but not other people's data", async () => {
    const u = await createVerifiedTestUser({ password: "deleteme123" });
    const friend = await createVerifiedTestUser();
    const course = await createTestCourse("Delete Course", 9);
    const round = await prisma.round.create({
      data: { userId: u.id, courseId: course.id, roundHoles: { create: [{ holeId: course.holes[0].id, strokes: 4 }] } },
    });
    const friendRound = await prisma.round.create({ data: { userId: friend.id, courseId: course.id } });
    await prisma.friendship.create({ data: { requesterId: u.id, addresseeId: friend.id, status: "ACCEPTED" } });
    await prisma.roundComment.create({ data: { roundId: friendRound.id, userId: u.id, text: "hi" } });

    const noConfirm = await request(app).delete("/auth/account").set(auth(u.accessToken)).send({ password: "deleteme123" });
    expect(noConfirm.status).toBe(400);
    const badPw = await request(app).delete("/auth/account").set(auth(u.accessToken)).send({ confirm: "DELETE", password: "x" });
    expect(badPw.status).toBe(401);

    const res = await request(app).delete("/auth/account").set(auth(u.accessToken)).send({ confirm: "DELETE", password: "deleteme123" });
    expect(res.status).toBe(200);

    expect(await prisma.user.findUnique({ where: { id: u.id } })).toBeNull();
    expect(await prisma.round.findUnique({ where: { id: round.id } })).toBeNull();
    expect(await prisma.round.findUnique({ where: { id: friendRound.id } })).not.toBeNull();
    expect(await prisma.roundComment.count({ where: { roundId: friendRound.id } })).toBe(0);
    expect(await prisma.friendship.count()).toBe(0);
  });
});

describe("GET /rounds/export.csv", () => {
  it("exports the user's rounds as CSV, quoting awkward course names", async () => {
    const u = await createVerifiedTestUser();
    const course = await createTestCourse('Smith\'s "Links", North', 9);
    await prisma.round.create({
      data: {
        userId: u.id, courseId: course.id, playedAt: new Date("2026-09-14T09:00:00Z"), completedAt: new Date(),
        roundHoles: { create: course.holes.map((h) => ({ holeId: h.id, strokes: h.par + 1, putts: 2 })) },
      },
    });
    const res = await request(app).get("/rounds/export.csv").set(auth(u.accessToken));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    const [header, row] = res.text.trim().split("\n");
    expect(header.split(",")[0]).toBe("Date");
    expect(row.startsWith('2026-09-14,"Smith\'s ""Links"", North",9,9,')).toBe(true);
    expect(row).toContain(",9,18,");
  });
});
