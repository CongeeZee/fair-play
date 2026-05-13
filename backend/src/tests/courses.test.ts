import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createVerifiedTestUser, createTestCourse } from "./setup";

// Mock the global fetch used by course routes to call external Golf API
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

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

const { default: app } = await import("../app");

beforeEach(() => {
  mockFetch.mockReset();
});

const MOCK_SEARCH_RESPONSE = {
  courses: [
    { id: 12345, club_name: "Pine Valley GC", course_name: "Pine Valley" },
    { id: 12346, club_name: "Augusta National", course_name: "Augusta" },
  ],
};

const MOCK_TEES_RESPONSE = {
  course: {
    course_name: "Pine Valley",
    club_name: "Pine Valley GC",
    tees: {
      male: [
        { tee_name: "Blue", total_yards: 6700, par_total: 72 },
        { tee_name: "White", total_yards: 6200, par_total: 72 },
      ],
      female: [
        { tee_name: "Red", total_yards: 5400, par_total: 72 },
      ],
    },
  },
};

describe("GET /courses/search", () => {
  it("returns results for valid query", async () => {
    process.env.GOLF_API_KEY = "test-api-key";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_SEARCH_RESPONSE,
    });

    const res = await request(app).get("/courses/search?q=pine valley");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].club_name).toBe("Pine Valley GC");
  });

  it("returns empty array for short query", async () => {
    const res = await request(app).get("/courses/search?q=a");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns 503 when API key not configured", async () => {
    const saved = process.env.GOLF_API_KEY;
    delete process.env.GOLF_API_KEY;

    // Use a unique query to avoid hitting the in-memory cache from earlier tests
    const res = await request(app).get("/courses/search?q=uncached unique course name");

    expect(res.status).toBe(503);
    process.env.GOLF_API_KEY = saved;
  });
});

describe("GET /courses/tees/:externalId", () => {
  it("returns tee data for valid external ID", async () => {
    process.env.GOLF_API_KEY = "test-api-key";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_TEES_RESPONSE,
    });

    const res = await request(app).get("/courses/tees/12345");

    expect(res.status).toBe(200);
    expect(res.body.courseName).toBe("Pine Valley");
    expect(res.body.tees).toHaveLength(3);
    expect(res.body.tees[0].name).toBe("Blue");
  });

  it("returns 502 when external API fails", async () => {
    process.env.GOLF_API_KEY = "test-api-key";
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const res = await request(app).get("/courses/tees/99999");

    expect(res.status).toBe(502);
  });
});

describe("GET /courses", () => {
  it("returns courses from database", async () => {
    await createTestCourse("Pebble Beach");
    await createTestCourse("St Andrews");

    const res = await request(app).get("/courses");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("filters by search query", async () => {
    await createTestCourse("Pebble Beach");
    await createTestCourse("St Andrews");

    const res = await request(app).get("/courses?search=Pebble");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("Pebble Beach");
  });
});

describe("POST /courses", () => {
  it("creates a course when authenticated", async () => {
    const user = await createVerifiedTestUser();

    const res = await request(app)
      .post("/courses")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({
        name: "My Course",
        holes: [
          { number: 1, par: 4, distance: 380 },
          { number: 2, par: 3, distance: 165 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("My Course");
    expect(res.body.holes).toHaveLength(2);
  });

  it("returns 401 without auth", async () => {
    const res = await request(app).post("/courses").send({
      name: "No Auth Course",
      holes: [{ number: 1, par: 4, distance: 380 }],
    });

    expect(res.status).toBe(401);
  });
});
