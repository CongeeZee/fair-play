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

/** Notification writes are fire-and-forget; give them a moment to land. */
async function inboxOf(token: string) {
  for (let i = 0; i < 20; i++) {
    const res = await request(app).get("/notifications").set(auth(token));
    if (res.body.items?.length) return res.body;
    await new Promise((r) => setTimeout(r, 50));
  }
  return (await request(app).get("/notifications").set(auth(token))).body;
}

async function friends(a: number, b: number) {
  await prisma.friendship.create({ data: { requesterId: a, addresseeId: b, status: "ACCEPTED" } });
}

async function finishedRound(userId: number) {
  const course = await createTestCourse("Notify Course", 9);
  return prisma.round.create({
    data: {
      userId, courseId: course.id, completedAt: new Date(), shareId: `share${userId}${Date.now()}`,
      roundHoles: { create: course.holes.map((h) => ({ holeId: h.id, strokes: h.par })) },
    },
  });
}

describe("in-app notifications", () => {
  it("tells the owner about a reaction, linking to the round", async () => {
    const owner = await createVerifiedTestUser({ name: "Owner" });
    const fan = await createVerifiedTestUser({ name: "Fan" });
    await friends(owner.id, fan.id);
    const round = await finishedRound(owner.id);

    await request(app).post(`/rounds/${round.id}/react`).set(auth(fan.accessToken)).send({ emoji: "\u{1F525}" });

    const inbox = await inboxOf(owner.accessToken);
    expect(inbox.unreadCount).toBe(1);
    expect(inbox.items[0]).toMatchObject({
      type: "reaction",
      url: `/scorecard/${round.shareId}`,
      read: false,
      actor: { id: fan.id, name: "Fan" },
    });
  });

  it("notifies the owner and earlier commenters, but never the commenter", async () => {
    const owner = await createVerifiedTestUser();
    const first = await createVerifiedTestUser();
    const second = await createVerifiedTestUser();
    await friends(owner.id, first.id);
    await friends(owner.id, second.id);
    const round = await finishedRound(owner.id);

    await request(app).post(`/rounds/${round.id}/comments`).set(auth(first.accessToken)).send({ text: "Nice" });
    await request(app).post(`/rounds/${round.id}/comments`).set(auth(second.accessToken)).send({ text: "Agreed" });

    await new Promise((r) => setTimeout(r, 300));
    const ownerInbox = await inboxOf(owner.accessToken);
    const firstInbox = await inboxOf(first.accessToken);
    const secondInbox = (await request(app).get("/notifications").set(auth(second.accessToken))).body;

    expect(ownerInbox.items.filter((n: { type: string }) => n.type === "comment")).toHaveLength(2);
    expect(firstInbox.items).toHaveLength(1);
    expect(firstInbox.items[0].type).toBe("comment_reply");
    expect(secondInbox.items).toHaveLength(0);
  });

  it("notifies the requester when a friend request is accepted", async () => {
    const a = await createVerifiedTestUser();
    const b = await createVerifiedTestUser({ name: "Bea" });
    const req = await request(app).post("/friends/request").set(auth(a.accessToken)).send({ addresseeId: b.id });
    expect(req.status).toBe(201);

    const bInbox = await inboxOf(b.accessToken);
    expect(bInbox.items[0].type).toBe("friend_request");

    await request(app).post(`/friends/accept/${req.body.friendshipId}`).set(auth(b.accessToken));
    const aInbox = await inboxOf(a.accessToken);
    expect(aInbox.items[0]).toMatchObject({ type: "friend_accepted", url: `/profile/${b.id}` });
  });

  it("marks one or all notifications read, only for the caller", async () => {
    const me = await createVerifiedTestUser();
    const other = await createVerifiedTestUser();
    await prisma.notification.createMany({
      data: [
        { userId: me.id, type: "comment", title: "t", body: "b", url: "/feed" },
        { userId: me.id, type: "comment", title: "t", body: "b", url: "/feed" },
        { userId: other.id, type: "comment", title: "t", body: "b", url: "/feed" },
      ],
    });
    const mine = await request(app).get("/notifications").set(auth(me.accessToken));
    const oneId = mine.body.items[0].id;

    await request(app).post("/notifications/read").set(auth(me.accessToken)).send({ ids: [oneId] });
    let count = await request(app).get("/notifications/unread-count").set(auth(me.accessToken));
    expect(count.body.unreadCount).toBe(1);

    await request(app).post("/notifications/read").set(auth(me.accessToken)).send({});
    count = await request(app).get("/notifications/unread-count").set(auth(me.accessToken));
    expect(count.body.unreadCount).toBe(0);

    const theirs = await request(app).get("/notifications/unread-count").set(auth(other.accessToken));
    expect(theirs.body.unreadCount).toBe(1);
  });
});
