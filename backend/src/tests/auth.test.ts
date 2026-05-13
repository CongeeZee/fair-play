import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createTestUser, createVerifiedTestUser, prisma } from "./setup";

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

// Import app after mocks are set up
const { default: app } = await import("../app");

describe("POST /auth/register", () => {
  it("returns access + refresh tokens on successful registration", async () => {
    const res = await request(app).post("/auth/register").send({
      email: "new@test.com",
      password: "password123",
      name: "New User",
    });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.email).toBe("new@test.com");
    expect(res.body.user.name).toBe("New User");
    expect(res.body.user.emailVerified).toBe(false);
  });

  it("returns 409 for duplicate email", async () => {
    await createTestUser({ email: "dup@test.com" });

    const res = await request(app).post("/auth/register").send({
      email: "dup@test.com",
      password: "password123",
      name: "Dup User",
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Email already registered");
  });

  it("returns 400 for invalid email format", async () => {
    const res = await request(app).post("/auth/register").send({
      email: "not-an-email",
      password: "password123",
      name: "Bad Email",
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 for missing fields", async () => {
    const res = await request(app).post("/auth/register").send({
      email: "missing@test.com",
    });

    expect(res.status).toBe(400);
  });
});

describe("POST /auth/login", () => {
  it("returns tokens for correct credentials", async () => {
    await createTestUser({ email: "login@test.com", password: "mypassword" });

    const res = await request(app).post("/auth/login").send({
      email: "login@test.com",
      password: "mypassword",
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.email).toBe("login@test.com");
  });

  it("returns 401 for wrong password", async () => {
    await createTestUser({ email: "wrong@test.com", password: "correctpass" });

    const res = await request(app).post("/auth/login").send({
      email: "wrong@test.com",
      password: "wrongpass",
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });

  it("returns 401 for non-existent email", async () => {
    const res = await request(app).post("/auth/login").send({
      email: "noone@test.com",
      password: "password123",
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });
});

describe("POST /auth/refresh", () => {
  it("returns new tokens for valid refresh token", async () => {
    const user = await createTestUser();

    const res = await request(app).post("/auth/refresh").send({
      refreshToken: user.refreshToken,
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    // New refresh token should be different (rotation)
    expect(res.body.refreshToken).not.toBe(user.refreshToken);
  });

  it("returns 401 for invalid refresh token", async () => {
    const res = await request(app).post("/auth/refresh").send({
      refreshToken: "totally-invalid-token",
    });

    expect(res.status).toBe(401);
  });

  it("returns 401 when reusing a rotated token", async () => {
    const user = await createTestUser();

    // First refresh — consumes the token
    await request(app).post("/auth/refresh").send({
      refreshToken: user.refreshToken,
    });

    // Second refresh with same token — should fail
    const res = await request(app).post("/auth/refresh").send({
      refreshToken: user.refreshToken,
    });

    expect(res.status).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  it("invalidates the refresh token", async () => {
    const user = await createTestUser();

    const logoutRes = await request(app).post("/auth/logout").send({
      refreshToken: user.refreshToken,
    });
    expect(logoutRes.status).toBe(200);

    // Refresh should now fail
    const refreshRes = await request(app).post("/auth/refresh").send({
      refreshToken: user.refreshToken,
    });
    expect(refreshRes.status).toBe(401);
  });
});

describe("GET /auth/verify-email/:token", () => {
  it("verifies user with valid token", async () => {
    const verificationToken = "test-verify-token-123";
    const user = await createTestUser({ email: "verify@test.com" });
    await prisma.user.update({
      where: { id: user.id },
      data: { verificationToken, emailVerified: false },
    });

    const res = await request(app).get(`/auth/verify-email/${verificationToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Email verified successfully");

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.emailVerified).toBe(true);
  });

  it("returns 400 for invalid token", async () => {
    const res = await request(app).get("/auth/verify-email/invalid-token");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid");
  });
});

describe("POST /auth/resend-verification", () => {
  it("requires authentication", async () => {
    const res = await request(app).post("/auth/resend-verification");

    expect(res.status).toBe(401);
  });

  it("sends new verification token for unverified user", async () => {
    const user = await createTestUser();

    const res = await request(app)
      .post("/auth/resend-verification")
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Verification email sent");
  });

  it("returns success message for already verified user", async () => {
    const user = await createVerifiedTestUser();

    const res = await request(app)
      .post("/auth/resend-verification")
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Email already verified");
  });
});
