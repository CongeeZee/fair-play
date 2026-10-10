import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createVerifiedTestUser, createTestCourse, prisma } from "./setup";

vi.mock("../lib/email", () => ({ sendVerificationEmail: vi.fn() }));
vi.mock("../middleware/rateLimiter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../middleware/rateLimiter")>();
  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return Object.fromEntries(Object.keys(actual).map((name) => [name, passthrough]));
});
vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("mocked")));

const { default: app } = await import("../app");
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const link = (a: number, b: number, status: "ACCEPTED" | "PENDING" | "BLOCKED" = "ACCEPTED") =>
  prisma.friendship.create({ data: { requesterId: a, addresseeId: b, status } });

describe("GET /friends/search", () => {
  it("finds by exact email, never by partial email", async () => {
    const me = await createVerifiedTestUser();
    const target = await createVerifiedTestUser({ name: "Quiet Person", email: "quiet.person@example.com" });

    const exact = await request(app).get("/friends/search").query({ q: "Quiet.Person@example.com" }).set(auth(me.accessToken));
    expect(exact.body.map((u: { id: number }) => u.id)).toEqual([target.id]);

    const partial = await request(app).get("/friends/search").query({ q: "quiet.person@" }).set(auth(me.accessToken));
    expect(partial.body).toEqual([]);
  });

  it("hides people who blocked you, and lets you accept an incoming request", async () => {
    const me = await createVerifiedTestUser({ name: "Me Myself" });
    const blocker = await createVerifiedTestUser({ name: "Golfer Blocker" });
    const asker = await createVerifiedTestUser({ name: "Golfer Asker" });
    await link(blocker.id, me.id, "BLOCKED");
    const req = await link(asker.id, me.id, "PENDING");

    const res = await request(app).get("/friends/search").query({ q: "golfer" }).set(auth(me.accessToken));
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id: asker.id, isPending: false, incomingRequestId: req.id });
  });

  it("ranks names that start with the query first", async () => {
    const me = await createVerifiedTestUser();
    await createVerifiedTestUser({ name: "Zed Sam" });
    await createVerifiedTestUser({ name: "Sam Allen" });
    const res = await request(app).get("/friends/search").query({ q: "sam" }).set(auth(me.accessToken));
    expect(res.body.map((u: { name: string }) => u.name)).toEqual(["Sam Allen", "Zed Sam"]);
  });
});

describe("GET /friends/suggestions", () => {
  it("suggests friends of friends by mutual count, and playing partners first", async () => {
    const me = await createVerifiedTestUser();
    const f1 = await createVerifiedTestUser();
    const f2 = await createVerifiedTestUser();
    const twoMutual = await createVerifiedTestUser({ name: "Two Mutual" });
    const oneMutual = await createVerifiedTestUser({ name: "One Mutual" });
    const partner = await createVerifiedTestUser({ name: "Played With" });
    const alreadyAsked = await createVerifiedTestUser();

    await link(me.id, f1.id);
    await link(f2.id, me.id);
    await link(f1.id, twoMutual.id);
    await link(twoMutual.id, f2.id);
    await link(f1.id, oneMutual.id);
    await link(f1.id, alreadyAsked.id);
    await link(me.id, alreadyAsked.id, "PENDING").catch(async () => {
      // unique on (requester, addressee) — fine either way for this test
    });

    const course = await createTestCourse("Sugg Course", 9);
    const round = await prisma.round.create({ data: { userId: partner.id, courseId: course.id } });
    await prisma.roundPartner.create({ data: { roundId: round.id, userId: me.id } });

    const res = await request(app).get("/friends/suggestions").set(auth(me.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.map((s: { name: string }) => s.name)).toEqual(["Played With", "Two Mutual", "One Mutual"]);
    expect(res.body[1].mutualFriends).toBe(2);
    expect(res.body[0].playedWith).toBe(true);
  });
});
