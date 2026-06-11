// Load .env BEFORE reading any env vars below. Previously this file relied on
// a test file transitively importing dotenv before Prisma connected — fragile.
import "dotenv/config";
import { beforeAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

// SAFETY: tests TRUNCATE every table before each test, so they must NEVER run
// against the real database. A dedicated DATABASE_URL_TEST is required — we
// deliberately do NOT fall back to DATABASE_URL (that fallback once wiped the
// production data). Fail fast and loudly instead.
const testDbUrl = process.env.DATABASE_URL_TEST;
if (!testDbUrl) {
  throw new Error(
    "DATABASE_URL_TEST is not set. Tests truncate all tables, so they refuse to " +
      "run against DATABASE_URL. Create a separate test database (e.g. a local " +
      "Postgres or a Supabase branch), run migrations against it, and set " +
      "DATABASE_URL_TEST in backend/.env before running vitest.",
  );
}
if (process.env.DATABASE_URL && testDbUrl === process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL_TEST points at the same database as DATABASE_URL. Refusing to " +
      "run: tests TRUNCATE all tables and would destroy real data.",
  );
}
process.env.DATABASE_URL = testDbUrl;

// Ensure JWT_SECRET is set for tests
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-ci";

// Suppress email sending in tests
process.env.RESEND_API_KEY = "";

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  // Use raw SQL TRUNCATE CASCADE to avoid FK ordering issues
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "RoundHole", "Round", "Hole", "Course", "RefreshToken", "InviteAcceptance", "InviteLink", "Friendship", "User", "BenchmarkSnapshot" CASCADE
  `);
});

// ── Helper functions ──────────────────────────────────────────────────────

interface TestUser {
  id: number;
  email: string;
  name: string;
  accessToken: string;
  refreshToken: string;
}

let userCounter = 0;

export async function createTestUser(
  overrides?: { email?: string; name?: string; password?: string },
): Promise<TestUser> {
  userCounter++;
  const email = overrides?.email || `testuser${userCounter}-${Date.now()}@test.com`;
  const name = overrides?.name || `Test User ${userCounter}`;
  const password = overrides?.password || "password123";

  const passwordHash = await bcrypt.hash(password, 4); // low rounds for speed
  const user = await prisma.user.create({
    data: { email, name, passwordHash, emailVerified: false },
  });

  const accessToken = jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET!,
    { expiresIn: "15m" },
  );

  const rawRefresh = crypto.randomBytes(40).toString("hex");
  const hashedRefresh = crypto.createHash("sha256").update(rawRefresh).digest("hex");
  await prisma.refreshToken.create({
    data: {
      token: hashedRefresh,
      userId: user.id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  return { id: user.id, email, name, accessToken, refreshToken: rawRefresh };
}

export async function createVerifiedTestUser(
  overrides?: { email?: string; name?: string; password?: string },
): Promise<TestUser> {
  const email = overrides?.email || `verified${++userCounter}-${Date.now()}@test.com`;
  const name = overrides?.name || `Verified User ${userCounter}`;
  const password = overrides?.password || "password123";

  const passwordHash = await bcrypt.hash(password, 4);
  const user = await prisma.user.create({
    data: { email, name, passwordHash, emailVerified: true },
  });

  const accessToken = jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET!,
    { expiresIn: "15m" },
  );

  const rawRefresh = crypto.randomBytes(40).toString("hex");
  const hashedRefresh = crypto.createHash("sha256").update(rawRefresh).digest("hex");
  await prisma.refreshToken.create({
    data: {
      token: hashedRefresh,
      userId: user.id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  return { id: user.id, email, name, accessToken, refreshToken: rawRefresh };
}

export async function createTestCourse(
  name = "Test Course",
  holes = 18,
  options?: { courseRating?: number; slopeRating?: number },
) {
  return prisma.course.create({
    data: {
      name,
      courseRating: options?.courseRating ?? null,
      slopeRating: options?.slopeRating ?? null,
      holes: {
        create: Array.from({ length: holes }, (_, i) => ({
          number: i + 1,
          par: i % 3 === 0 ? 3 : i % 3 === 1 ? 4 : 5,
          distance: 150 + i * 20,
        })),
      },
    },
    include: { holes: { orderBy: { number: "asc" } } },
  });
}

export { prisma };
