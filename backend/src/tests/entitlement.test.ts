import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Response } from "express";
import type { AuthRequest } from "../middleware/auth";

// Disable rate limiting just in case any indirect import pulls it in.
vi.mock("../middleware/rateLimiter", () => {
  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    strictLimiter: passthrough,
    moderateLimiter: passthrough,
    standardLimiter: passthrough,
  };
});

// We mock features.ts so we can simulate "what happens AFTER the flip-to-paid"
// without touching the real FEATURE_REQUIREMENTS map (which is FREE today).
vi.mock("../lib/features", async () => {
  const actual = await vi.importActual<typeof import("../lib/features")>("../lib/features");
  return {
    ...actual,
    // Override the requirement map: strokesGained is gated to PRO.
    getRequiredTier: vi.fn((key: string) => (key === "strokesGained" ? "PRO" : "FREE")),
    isFeatureFree: vi.fn((key: string) => key !== "strokesGained"),
  };
});

// Mock getUserTier so we can dial the caller's tier without DB access.
vi.mock("../lib/entitlement", () => ({
  getUserTier: vi.fn(),
}));

const { requireFeature } = await import("../middleware/entitlement");
const { getUserTier } = await import("../lib/entitlement");
const features = await import("../lib/features");

function mockResponse() {
  const res = {} as Response;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.status = vi.fn().mockReturnValue(res) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.json = vi.fn().mockReturnValue(res) as any;
  return res;
}

describe("requireFeature middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes immediately for FREE features without checking the user's tier", async () => {
    const req = { userId: 42 } as AuthRequest;
    const res = mockResponse();
    const next = vi.fn();

    await requireFeature("trends")(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(getUserTier).not.toHaveBeenCalled();
  });

  it("returns 402 when the user's tier is below the required tier", async () => {
    vi.mocked(getUserTier).mockResolvedValue("FREE");

    const req = { userId: 42 } as AuthRequest;
    const res = mockResponse();
    const next = vi.fn();

    await requireFeature("strokesGained")(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Payment required",
        feature: "strokesGained",
        requiredTier: "PRO",
        currentTier: "FREE",
      }),
    );
  });

  it("passes when the user's tier meets the required tier", async () => {
    vi.mocked(getUserTier).mockResolvedValue("PRO");

    const req = { userId: 42 } as AuthRequest;
    const res = mockResponse();
    const next = vi.fn();

    await requireFeature("strokesGained")(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 401 when called without an authenticated user on a paid feature", async () => {
    const req = {} as AuthRequest;
    const res = mockResponse();
    const next = vi.fn();

    await requireFeature("strokesGained")(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe("tierMeets", () => {
  it("ranks FREE < PRO < SOCIETY", () => {
    expect(features.tierMeets("SOCIETY", "PRO")).toBe(true);
    expect(features.tierMeets("PRO", "PRO")).toBe(true);
    expect(features.tierMeets("FREE", "PRO")).toBe(false);
    expect(features.tierMeets("PRO", "SOCIETY")).toBe(false);
  });
});

describe("getUserTier", () => {
  // Top-of-file vi.mock("../lib/entitlement") replaced the real module with
  // a stub for the requireFeature tests above. Undo that here so we exercise
  // the real implementation against a mocked prisma client.
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../lib/entitlement");
  });

  it("returns SOCIETY when no Subscription row exists (today's default)", async () => {
    vi.doMock("../lib/prisma", () => ({
      default: {
        subscription: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      },
    }));
    const { getUserTier: real } = await import("../lib/entitlement");
    await expect(real(1)).resolves.toBe("SOCIETY");
  });

  it("returns the row's tier when an ACTIVE Subscription exists", async () => {
    vi.doMock("../lib/prisma", () => ({
      default: {
        subscription: {
          findUnique: vi.fn().mockResolvedValue({ tier: "PRO", status: "ACTIVE" }),
        },
      },
    }));
    const { getUserTier: real } = await import("../lib/entitlement");
    await expect(real(1)).resolves.toBe("PRO");
  });

  it("falls back to SOCIETY (open access) when the row is PAST_DUE / CANCELED", async () => {
    vi.doMock("../lib/prisma", () => ({
      default: {
        subscription: {
          findUnique: vi.fn().mockResolvedValue({ tier: "PRO", status: "CANCELED" }),
        },
      },
    }));
    const { getUserTier: real } = await import("../lib/entitlement");
    await expect(real(1)).resolves.toBe("SOCIETY");
  });

  it("falls back to SOCIETY if the subscription table doesn't exist yet", async () => {
    vi.doMock("../lib/prisma", () => ({
      default: {
        subscription: {
          findUnique: vi.fn().mockRejectedValue(new Error("relation does not exist")),
        },
      },
    }));
    const { getUserTier: real } = await import("../lib/entitlement");
    await expect(real(1)).resolves.toBe("SOCIETY");
  });
});
