import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import app from "../app";

// Mock email sending
vi.mock("../lib/email", () => ({
  sendVerificationEmail: vi.fn(),
}));

// Mock fetch for any external API calls
vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("mocked")));

describe("Rate limiting", () => {
  /**
   * Sign-in moved off `strictLimiter` (5/min, all requests counted) onto
   * `authLimiter` (20/min, `skipSuccessfulRequests`) so a correct password is
   * never throttled while wrong guesses still cap brute force. These tests
   * were left asserting the old 5/min budget and had been failing on every run
   * since; the numbers below now come from `authLimiter`'s configuration.
   */
  describe("Sign-in (auth — 20 failures/min)", () => {
    it("returns 429 after 20 failed requests to /auth/login", async () => {
      const responses: number[] = [];

      for (let i = 0; i < 22; i++) {
        const res = await request(app).post("/auth/login").send({
          email: "rate@test.com",
          password: "password123",
        });
        responses.push(res.status);
      }

      // The first 20 get through (401 — the user does not exist)
      expect(responses.slice(0, 20).every((s) => s === 401)).toBe(true);
      // 21st onward are throttled
      expect(responses[20]).toBe(429);
      expect(responses[21]).toBe(429);
    });

    it("returns correct JSON body and Retry-After header on 429", async () => {
      // Exhaust the limit. A different email to keep this independent of the
      // test above — the limiter keys on IP, but the intent is clearer.
      for (let i = 0; i < 20; i++) {
        await request(app).post("/auth/login").send({
          email: "header@test.com",
          password: "pass",
        });
      }

      const res = await request(app).post("/auth/login").send({
        email: "header@test.com",
        password: "pass",
      });

      expect(res.status).toBe(429);
      expect(res.body.error).toBe("Too many requests, please try again later");
      expect(res.headers["retry-after"]).toBeDefined();
    });
  });

  describe("Course search (moderate — 20/min)", () => {
    it("returns 429 after 20 requests to /courses/search", async () => {
      const responses: number[] = [];

      for (let i = 0; i < 22; i++) {
        // Use short query to avoid hitting external API (returns [] for <2 chars)
        const res = await request(app).get("/courses/search?q=x");
        responses.push(res.status);
      }

      // First 20 should succeed
      expect(responses.slice(0, 20).every((s) => s === 200)).toBe(true);
      // 21st+ should be rate limited
      expect(responses[20]).toBe(429);
    });
  });

  describe("Standard limiter (100/min)", () => {
    it("applies to general routes", async () => {
      // Just verify the health endpoint works within limits
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    });
  });
});
