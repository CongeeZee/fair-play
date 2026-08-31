import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createTestUser, createVerifiedTestUser, prisma } from "./setup";

// Mock email sending
vi.mock("../lib/email", () => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

// Disable rate limiting for functional tests
vi.mock("../middleware/rateLimiter", async (importOriginal) => {
  // Every export is replaced with a passthrough, derived from the real module
  // rather than listed by hand. The hand-written version named four of the six
  // limiters, so adding `signupLimiter` to the app broke six test files at
  // import time — they reported "0 test" and stopped running entirely, which
  // is quiet enough to miss.
  const actual = await importOriginal<typeof import("../middleware/rateLimiter")>();
  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return Object.fromEntries(Object.keys(actual).map((name) => [name, passthrough]));
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

describe("POST /auth/forgot-password", () => {
  it("returns 200 with generic message when the email does not exist (no leak)", async () => {
    const res = await request(app).post("/auth/forgot-password").send({
      email: "nobody@test.com",
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account exists/i);
    // Critically: no field like `exists`, `found`, or different wording for hits vs misses
    expect(res.body).not.toHaveProperty("exists");
  });

  it("returns the same generic message when the email DOES exist (no leak)", async () => {
    await createTestUser({ email: "exists@test.com" });

    const hitRes = await request(app).post("/auth/forgot-password").send({
      email: "exists@test.com",
    });
    const missRes = await request(app).post("/auth/forgot-password").send({
      email: "missing@test.com",
    });

    expect(hitRes.status).toBe(200);
    expect(missRes.status).toBe(200);
    expect(hitRes.body).toEqual(missRes.body);
  });

  it("sets a reset token + expiry on the user when email exists", async () => {
    const user = await createTestUser({ email: "reset-me@test.com" });

    const before = Date.now();
    await request(app).post("/auth/forgot-password").send({
      email: "reset-me@test.com",
    });
    const after = Date.now();

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.passwordResetToken).toBeTruthy();
    expect(updated?.passwordResetExpires).toBeTruthy();
    const expiresMs = updated!.passwordResetExpires!.getTime();
    // ~1 hour expiry
    expect(expiresMs).toBeGreaterThanOrEqual(before + 60 * 60 * 1000 - 1000);
    expect(expiresMs).toBeLessThanOrEqual(after + 60 * 60 * 1000 + 1000);
  });

  it("does NOT set a reset token for Google-only users (no passwordHash)", async () => {
    const googleUser = await prisma.user.create({
      data: {
        email: "google@test.com",
        name: "Google User",
        googleId: "google-id-123",
        emailVerified: true,
      },
    });

    const res = await request(app).post("/auth/forgot-password").send({
      email: "google@test.com",
    });
    expect(res.status).toBe(200);

    const updated = await prisma.user.findUnique({ where: { id: googleUser.id } });
    expect(updated?.passwordResetToken).toBeNull();
    expect(updated?.passwordResetExpires).toBeNull();
  });

  it("returns 400 for invalid email format", async () => {
    const res = await request(app).post("/auth/forgot-password").send({
      email: "not-an-email",
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /auth/reset-password", () => {
  it("resets the password with a valid token and invalidates refresh tokens", async () => {
    const user = await createTestUser({ email: "rp@test.com", password: "oldpass1" });

    // Seed reset token directly
    const token = "valid-reset-token-abc";
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: token,
        passwordResetExpires: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    const res = await request(app).post("/auth/reset-password").send({
      token,
      newPassword: "brandnewpass",
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/reset/i);

    // Token fields cleared
    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.passwordResetToken).toBeNull();
    expect(updated?.passwordResetExpires).toBeNull();

    // New password works for login
    const loginRes = await request(app).post("/auth/login").send({
      email: "rp@test.com",
      password: "brandnewpass",
    });
    expect(loginRes.status).toBe(200);

    // Existing refresh token invalidated
    const refreshRes = await request(app).post("/auth/refresh").send({
      refreshToken: user.refreshToken,
    });
    expect(refreshRes.status).toBe(401);
  });

  it("rejects an expired token", async () => {
    const user = await createTestUser({ email: "expired@test.com" });

    const token = "expired-token-xyz";
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: token,
        passwordResetExpires: new Date(Date.now() - 60 * 1000), // 1 min in the past
      },
    });

    const res = await request(app).post("/auth/reset-password").send({
      token,
      newPassword: "shouldnotwork",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid or expired/i);

    // Password unchanged: original "password123" still works
    const loginRes = await request(app).post("/auth/login").send({
      email: "expired@test.com",
      password: "password123",
    });
    expect(loginRes.status).toBe(200);
  });

  it("rejects an unknown token", async () => {
    const res = await request(app).post("/auth/reset-password").send({
      token: "does-not-exist",
      newPassword: "whatever123",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid or expired/i);
  });

  it("rejects a password shorter than 8 characters", async () => {
    const res = await request(app).post("/auth/reset-password").send({
      token: "anything",
      newPassword: "short",
    });

    expect(res.status).toBe(400);
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
