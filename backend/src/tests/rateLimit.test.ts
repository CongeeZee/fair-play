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
  describe("Auth endpoints (strict — 5/min)", () => {
    it("returns 429 after 5 requests to /auth/login", async () => {
      const responses: number[] = [];

      for (let i = 0; i < 7; i++) {
        const res = await request(app).post("/auth/login").send({
          email: "rate@test.com",
          password: "password123",
        });
        responses.push(res.status);
      }

      // First 5 should get through (401 because user doesn't exist)
      expect(responses.slice(0, 5).every((s) => s === 401)).toBe(true);
      // 6th+ should be rate limited
      expect(responses[5]).toBe(429);
      expect(responses[6]).toBe(429);
    });

    it("returns correct JSON body and Retry-After header on 429", async () => {
      // Exhaust the limit
      for (let i = 0; i < 5; i++) {
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
