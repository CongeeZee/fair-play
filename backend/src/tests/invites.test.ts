import { describe, it as itBase, expect, vi } from "vitest";
// Each createVerifiedTestUser round-trips Supabase; tests that mint 3-4 users
// can exceed the global 30s ceiling. Bump per-test timeout for this suite.
const it = ((name: string, fn: () => Promise<void> | void) =>
  itBase(name, fn, 90_000)) as unknown as typeof itBase;
import request from "supertest";
import { createVerifiedTestUser, prisma } from "./setup";

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

const { default: app } = await import("../app");

async function friendshipBetween(a: number, b: number) {
  return prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a },
      ],
    },
  });
}

describe("POST /invites", () => {
  it("creates a link with label, maxUses, and expiry", async () => {
    const creator = await createVerifiedTestUser();

    const res = await request(app)
      .post("/invites")
      .set("Authorization", `Bearer ${creator.accessToken}`)
      .send({ label: "GOLFSOC", maxUses: 5, expiresInDays: 7 });

    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^[A-Za-z0-9_-]{10}$/);
    expect(res.body.label).toBe("GOLFSOC");
    expect(res.body.maxUses).toBe(5);
    expect(res.body.uses).toBe(0);
    expect(res.body.expiresAt).toBeTruthy();
  });

  it("requires authentication", async () => {
    const res = await request(app).post("/invites").send({});
    expect(res.status).toBe(401);
  });
});

describe("GET /invites/:code", () => {
  it("returns preview with inviter name and valid flag", async () => {
    const creator = await createVerifiedTestUser({ name: "Society Captain" });
    const create = await request(app)
      .post("/invites")
      .set("Authorization", `Bearer ${creator.accessToken}`)
      .send({ label: "MENS-WED" });

    const res = await request(app).get(`/invites/${create.body.code}`);
    expect(res.status).toBe(200);
    expect(res.body.inviter.name).toBe("Society Captain");
    expect(res.body.label).toBe("MENS-WED");
    expect(res.body.valid).toBe(true);
    expect(res.body.expired).toBe(false);
    expect(res.body.exhausted).toBe(false);
  });

  it("returns 404 for unknown code", async () => {
    const res = await request(app).get("/invites/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("marks expired and exhausted links as invalid", async () => {
    const creator = await createVerifiedTestUser();
    const expired = await prisma.inviteLink.create({
      data: {
        code: "expired-xx",
        creatorId: creator.id,
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const exhausted = await prisma.inviteLink.create({
      data: {
        code: "fullup-xxx",
        creatorId: creator.id,
        maxUses: 1,
        uses: 1,
      },
    });

    const r1 = await request(app).get(`/invites/${expired.code}`);
    const r2 = await request(app).get(`/invites/${exhausted.code}`);

    expect(r1.body.expired).toBe(true);
    expect(r1.body.valid).toBe(false);
    expect(r2.body.exhausted).toBe(true);
    expect(r2.body.valid).toBe(false);
  });
});

describe("POST /invites/:code/accept", () => {
  it("creates an accepted friendship between joiner and inviter", async () => {
    const inviter = await createVerifiedTestUser({ name: "Inviter" });
    const joiner = await createVerifiedTestUser({ name: "Joiner" });

    const create = await request(app)
      .post("/invites")
      .set("Authorization", `Bearer ${inviter.accessToken}`)
      .send({});

    const res = await request(app)
      .post(`/invites/${create.body.code}/accept`)
      .set("Authorization", `Bearer ${joiner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.alreadyAccepted).toBe(false);
    expect(res.body.friendsAdded).toBe(1);

    const f = await friendshipBetween(inviter.id, joiner.id);
    expect(f).not.toBeNull();
    expect(f?.status).toBe("ACCEPTED");

    const link = await prisma.inviteLink.findUnique({
      where: { code: create.body.code },
    });
    expect(link?.uses).toBe(1);
  });

  it("is idempotent — second accept returns alreadyAccepted and does not duplicate", async () => {
    const inviter = await createVerifiedTestUser();
    const joiner = await createVerifiedTestUser();

    const create = await request(app)
      .post("/invites")
      .set("Authorization", `Bearer ${inviter.accessToken}`)
      .send({});

    await request(app)
      .post(`/invites/${create.body.code}/accept`)
      .set("Authorization", `Bearer ${joiner.accessToken}`);

    const second = await request(app)
      .post(`/invites/${create.body.code}/accept`)
      .set("Authorization", `Bearer ${joiner.accessToken}`);

    expect(second.status).toBe(200);
    expect(second.body.alreadyAccepted).toBe(true);
    expect(second.body.friendsAdded).toBe(0);

    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: inviter.id, addresseeId: joiner.id },
          { requesterId: joiner.id, addresseeId: inviter.id },
        ],
      },
    });
    expect(friendships).toHaveLength(1);

    const link = await prisma.inviteLink.findUnique({
      where: { code: create.body.code },
    });
    expect(link?.uses).toBe(1); // not bumped twice
  });

  it("rejects expired links with 410", async () => {
    const inviter = await createVerifiedTestUser();
    const joiner = await createVerifiedTestUser();
    const link = await prisma.inviteLink.create({
      data: {
        code: "expired-yy",
        creatorId: inviter.id,
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const res = await request(app)
      .post(`/invites/${link.code}/accept`)
      .set("Authorization", `Bearer ${joiner.accessToken}`);

    expect(res.status).toBe(410);
    const f = await friendshipBetween(inviter.id, joiner.id);
    expect(f).toBeNull();
  });

  it("rejects accept after maxUses reached with 410", async () => {
    const inviter = await createVerifiedTestUser();
    const j1 = await createVerifiedTestUser();
    const j2 = await createVerifiedTestUser();

    const create = await request(app)
      .post("/invites")
      .set("Authorization", `Bearer ${inviter.accessToken}`)
      .send({ maxUses: 1 });

    const ok = await request(app)
      .post(`/invites/${create.body.code}/accept`)
      .set("Authorization", `Bearer ${j1.accessToken}`);
    expect(ok.status).toBe(200);

    const blocked = await request(app)
      .post(`/invites/${create.body.code}/accept`)
      .set("Authorization", `Bearer ${j2.accessToken}`);
    expect(blocked.status).toBe(410);
  });

  it("rejects accepting your own link", async () => {
    const inviter = await createVerifiedTestUser();
    const create = await request(app)
      .post("/invites")
      .set("Authorization", `Bearer ${inviter.accessToken}`)
      .send({});

    const res = await request(app)
      .post(`/invites/${create.body.code}/accept`)
      .set("Authorization", `Bearer ${inviter.accessToken}`);
    expect(res.status).toBe(400);
  });

  it("respects BLOCKED status and does not silently overwrite it", async () => {
    const inviter = await createVerifiedTestUser();
    const joiner = await createVerifiedTestUser();

    // Inviter blocks the joiner before they accept.
    await prisma.friendship.create({
      data: {
        requesterId: inviter.id,
        addresseeId: joiner.id,
        status: "BLOCKED",
      },
    });

    const create = await request(app)
      .post("/invites")
      .set("Authorization", `Bearer ${inviter.accessToken}`)
      .send({});

    const res = await request(app)
      .post(`/invites/${create.body.code}/accept`)
      .set("Authorization", `Bearer ${joiner.accessToken}`);

    // Acceptance is still recorded but no friendship gets created.
    expect(res.status).toBe(200);
    const f = await friendshipBetween(inviter.id, joiner.id);
    expect(f?.status).toBe("BLOCKED");
  });

  it("auto-promotes a pending friend request to accepted", async () => {
    const inviter = await createVerifiedTestUser();
    const joiner = await createVerifiedTestUser();

    await prisma.friendship.create({
      data: {
        requesterId: joiner.id,
        addresseeId: inviter.id,
        status: "PENDING",
      },
    });

    const create = await request(app)
      .post("/invites")
      .set("Authorization", `Bearer ${inviter.accessToken}`)
      .send({});

    await request(app)
      .post(`/invites/${create.body.code}/accept`)
      .set("Authorization", `Bearer ${joiner.accessToken}`);

    const f = await friendshipBetween(inviter.id, joiner.id);
    expect(f?.status).toBe("ACCEPTED");
  });

  it("auto-connects everyone who joins via the same link", async () => {
    const captain = await createVerifiedTestUser({ name: "Captain" });
    const a = await createVerifiedTestUser({ name: "Alice" });
    const b = await createVerifiedTestUser({ name: "Bob" });
    const c = await createVerifiedTestUser({ name: "Carol" });

    const create = await request(app)
      .post("/invites")
      .set("Authorization", `Bearer ${captain.accessToken}`)
      .send({ label: "society" });

    for (const u of [a, b, c]) {
      const res = await request(app)
        .post(`/invites/${create.body.code}/accept`)
        .set("Authorization", `Bearer ${u.accessToken}`);
      expect(res.status).toBe(200);
    }

    // All four should be mutually friends => 4 choose 2 = 6 friendships
    const friendships = await prisma.friendship.findMany({
      where: { status: "ACCEPTED" },
    });
    expect(friendships).toHaveLength(6);

    for (const [x, y] of [
      [captain.id, a.id],
      [captain.id, b.id],
      [captain.id, c.id],
      [a.id, b.id],
      [a.id, c.id],
      [b.id, c.id],
    ] as const) {
      const f = await friendshipBetween(x, y);
      expect(f?.status).toBe("ACCEPTED");
    }
  });

  it("clusters joiners across multiple links sharing the same label", async () => {
    const captain = await createVerifiedTestUser({ name: "Captain" });
    const a = await createVerifiedTestUser();
    const b = await createVerifiedTestUser();

    // Two separate links, same creator + label — joiners should still
    // end up mutually connected.
    const linkA = await request(app)
      .post("/invites")
      .set("Authorization", `Bearer ${captain.accessToken}`)
      .send({ label: "GOLFSOC" });
    const linkB = await request(app)
      .post("/invites")
      .set("Authorization", `Bearer ${captain.accessToken}`)
      .send({ label: "GOLFSOC" });

    await request(app)
      .post(`/invites/${linkA.body.code}/accept`)
      .set("Authorization", `Bearer ${a.accessToken}`);
    await request(app)
      .post(`/invites/${linkB.body.code}/accept`)
      .set("Authorization", `Bearer ${b.accessToken}`);

    const f = await friendshipBetween(a.id, b.id);
    expect(f?.status).toBe("ACCEPTED");
  });

  it("does NOT cluster joiners across links with different labels", async () => {
    const captain = await createVerifiedTestUser();
    const a = await createVerifiedTestUser();
    const b = await createVerifiedTestUser();

    const linkA = await request(app)
      .post("/invites")
      .set("Authorization", `Bearer ${captain.accessToken}`)
      .send({ label: "MENS" });
    const linkB = await request(app)
      .post("/invites")
      .set("Authorization", `Bearer ${captain.accessToken}`)
      .send({ label: "LADIES" });

    await request(app)
      .post(`/invites/${linkA.body.code}/accept`)
      .set("Authorization", `Bearer ${a.accessToken}`);
    await request(app)
      .post(`/invites/${linkB.body.code}/accept`)
      .set("Authorization", `Bearer ${b.accessToken}`);

    // Both should be friends with captain, but NOT with each other.
    expect(await friendshipBetween(captain.id, a.id)).not.toBeNull();
    expect(await friendshipBetween(captain.id, b.id)).not.toBeNull();
    expect(await friendshipBetween(a.id, b.id)).toBeNull();
  });

  it("does NOT cluster joiners across unlabelled links from the same creator", async () => {
    const captain = await createVerifiedTestUser();
    const a = await createVerifiedTestUser();
    const b = await createVerifiedTestUser();

    const linkA = await request(app)
      .post("/invites")
      .set("Authorization", `Bearer ${captain.accessToken}`)
      .send({});
    const linkB = await request(app)
      .post("/invites")
      .set("Authorization", `Bearer ${captain.accessToken}`)
      .send({});

    await request(app)
      .post(`/invites/${linkA.body.code}/accept`)
      .set("Authorization", `Bearer ${a.accessToken}`);
    await request(app)
      .post(`/invites/${linkB.body.code}/accept`)
      .set("Authorization", `Bearer ${b.accessToken}`);

    expect(await friendshipBetween(a.id, b.id)).toBeNull();
  });
});
