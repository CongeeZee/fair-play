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

type Course = Awaited<ReturnType<typeof createTestCourse>>;

/** A round with every hole scored at par + `over` on the first hole. */
async function playRound(
  userId: number,
  course: Course,
  opts: { daysAgo: number; completed?: boolean; over?: number },
) {
  const playedAt = new Date(Date.now() - opts.daysAgo * 864e5);
  return prisma.round.create({
    data: {
      userId,
      courseId: course.id,
      playedAt,
      completedAt: opts.completed === false ? null : playedAt,
      roundHoles: {
        create: course.holes.map((h, i) => ({
          holeId: h.id,
          strokes: h.par + (i === 0 ? (opts.over ?? 0) : 0),
          putts: 2,
          approachResult: "gir",
        })),
      },
    },
  });
}

async function befriend(a: number, b: number) {
  await prisma.friendship.create({ data: { requesterId: a, addresseeId: b, status: "ACCEPTED" } });
}

const getFeed = (token: string, cursor?: number) =>
  request(app)
    .get(`/rounds/feed${cursor ? `?cursor=${cursor}&limit=2` : "?limit=2"}`)
    .set("Authorization", `Bearer ${token}`);

describe("GET /rounds/feed", () => {
  it("includes your own finished rounds alongside friends', newest played first", async () => {
    const me = await createVerifiedTestUser();
    const friend = await createVerifiedTestUser();
    await befriend(me.id, friend.id);
    const course = await createTestCourse("Feed Course", 9);

    // Created in this order, but played in a different one — the feed must
    // follow playedAt, not insertion order.
    const old = await playRound(me.id, course, { daysAgo: 20 });
    const recent = await playRound(friend.id, course, { daysAgo: 1 });
    const middle = await playRound(me.id, course, { daysAgo: 5, over: 2 });

    const first = await getFeed(me.accessToken);
    expect(first.status).toBe(200);
    expect(first.body.feed.map((r: { id: number }) => r.id)).toEqual([recent.id, middle.id]);
    expect(first.body.feed[1].isOwn).toBe(true);
    expect(first.body.feed[1].scoreToPar).toBe(2);
    expect(first.body.feed[0].highlights).toMatchObject({ putts: 18, girs: 9, birdiesOrBetter: 0 });

    const second = await getFeed(me.accessToken, first.body.nextCursor);
    expect(second.body.feed.map((r: { id: number }) => r.id)).toEqual([old.id]);
    expect(second.body.nextCursor).toBeNull();
  });

  it("leaves out in-progress rounds and strangers' rounds", async () => {
    const me = await createVerifiedTestUser();
    const friend = await createVerifiedTestUser();
    const stranger = await createVerifiedTestUser();
    await befriend(friend.id, me.id);
    const course = await createTestCourse("Feed Course", 9);

    await playRound(friend.id, course, { daysAgo: 0, completed: false });
    await playRound(stranger.id, course, { daysAgo: 0 });
    const done = await playRound(friend.id, course, { daysAgo: 2 });

    const res = await getFeed(me.accessToken);
    expect(res.body.feed.map((r: { id: number }) => r.id)).toEqual([done.id]);
  });

  it("drops a friend's rounds once either side blocks", async () => {
    const me = await createVerifiedTestUser();
    const other = await createVerifiedTestUser();
    await befriend(me.id, other.id);
    const course = await createTestCourse("Feed Course", 9);
    await playRound(other.id, course, { daysAgo: 1 });

    const block = await request(app)
      .post(`/friends/block/${other.id}`)
      .set("Authorization", `Bearer ${me.accessToken}`);
    expect(block.status).toBe(200);

    const res = await getFeed(me.accessToken);
    expect(res.body.feed).toEqual([]);
  });
});
