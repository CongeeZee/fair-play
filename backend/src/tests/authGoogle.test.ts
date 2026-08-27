import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "./setup";

// The Google verifier is the one part of this flow we cannot exercise for real
// — it needs a live token signed by Google. Mock just the verification and let
// everything downstream (user lookup, account linking, token issuing) run
// against the real database, since that downstream half is where the failures
// have actually been.
const verifyIdToken = vi.fn();
vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    verifyIdToken = verifyIdToken;
  },
}));

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
// setup.ts exports its own PrismaClient instance; the routes use the singleton
// in lib/prisma. Spying on the wrong one silently does nothing, so grab the
// same instance the route under test actually calls.
const { default: routePrisma } = await import("../lib/prisma");

/** Make verifyIdToken resolve with a Google payload. */
function googleReturns(payload: Record<string, unknown> | undefined) {
  verifyIdToken.mockResolvedValueOnce({ getPayload: () => payload });
}

beforeEach(() => {
  verifyIdToken.mockReset();
});

describe("POST /auth/google", () => {
  it("creates a new verified user on first sign-in", async () => {
    googleReturns({ sub: "google-sub-1", email: "newgolfer@test.com", name: "New Golfer" });

    const res = await request(app).post("/auth/google").send({ credential: "valid-token" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user).toMatchObject({
      email: "newgolfer@test.com",
      name: "New Golfer",
      emailVerified: true,
    });

    const created = await prisma.user.findUnique({ where: { email: "newgolfer@test.com" } });
    expect(created?.googleId).toBe("google-sub-1");
    // Google-only account — no password was ever set.
    expect(created?.passwordHash).toBeNull();
  });

  it("verifies the token against our own client ID", async () => {
    googleReturns({ sub: "google-sub-2", email: "aud@test.com", name: "Aud" });

    await request(app).post("/auth/google").send({ credential: "valid-token" });

    // Without an audience, google-auth-library silently skips the check and
    // would accept a token minted for any other app.
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: "valid-token",
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    expect(process.env.GOOGLE_CLIENT_ID).toBeTruthy();
  });

  it("links Google to an existing email account and marks it verified", async () => {
    const existing = await prisma.user.create({
      data: {
        email: "existing@test.com",
        name: "Existing",
        passwordHash: "hash",
        emailVerified: false,
        verificationToken: "pending-token",
      },
    });

    googleReturns({ sub: "google-sub-3", email: "existing@test.com", name: "Existing" });

    const res = await request(app).post("/auth/google").send({ credential: "valid-token" });

    expect(res.status).toBe(200);
    const updated = await prisma.user.findUnique({ where: { id: existing.id } });
    expect(updated?.googleId).toBe("google-sub-3");
    expect(updated?.emailVerified).toBe(true);
    expect(updated?.verificationToken).toBeNull();
    // Linking must not create a second account for the same person.
    expect(await prisma.user.count({ where: { email: "existing@test.com" } })).toBe(1);
  });

  it("signs a returning Google user in without creating a duplicate", async () => {
    await prisma.user.create({
      data: {
        email: "returning@test.com",
        name: "Returning",
        googleId: "google-sub-4",
        emailVerified: true,
      },
    });

    googleReturns({ sub: "google-sub-4", email: "returning@test.com", name: "Returning" });

    const res = await request(app).post("/auth/google").send({ credential: "valid-token" });

    expect(res.status).toBe(200);
    expect(await prisma.user.count()).toBe(1);
  });

  it("falls back to the email local-part when Google sends no name", async () => {
    googleReturns({ sub: "google-sub-5", email: "noname@test.com" });

    const res = await request(app).post("/auth/google").send({ credential: "valid-token" });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe("noname");
  });

  it("rejects a missing credential with 400", async () => {
    const res = await request(app).post("/auth/google").send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Missing credential");
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("rejects an unverifiable token with 401", async () => {
    verifyIdToken.mockRejectedValueOnce(new Error("Invalid token signature"));

    const res = await request(app).post("/auth/google").send({ credential: "bad-token" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Google authentication failed");
    expect(await prisma.user.count()).toBe(0);
  });

  it("rejects a token whose payload carries no email with 401", async () => {
    googleReturns({ sub: "google-sub-6" });

    const res = await request(app).post("/auth/google").send({ credential: "valid-token" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid Google token");
  });

  it("reports a database failure as 500, not as a Google auth failure", async () => {
    // A paused database once surfaced to users as "Google sign-up failed",
    // which pointed the investigation at OAuth instead of at the outage.
    googleReturns({ sub: "google-sub-7", email: "dbdown@test.com", name: "DB Down" });
    const spy = vi
      .spyOn(routePrisma.user, "findFirst")
      .mockRejectedValueOnce(new Error("Can't reach database server"));

    const res = await request(app).post("/auth/google").send({ credential: "valid-token" });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Internal server error");
    spy.mockRestore();
  });
});
