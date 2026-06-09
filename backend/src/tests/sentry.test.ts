import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

describe("sentry module", () => {
  const origDsn = process.env.SENTRY_DSN;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (origDsn === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = origDsn;
  });

  it("is a no-op when SENTRY_DSN is unset", async () => {
    delete process.env.SENTRY_DSN;
    const mod = await import("../lib/sentry");
    mod.initSentry();
    expect(mod.isSentryEnabled()).toBe(false);

    // Error middleware should still forward + respond 500 even when disabled
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const res = { status, json, headersSent: false } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;
    mod.sentryErrorHandler(
      new Error("boom"),
      { path: "/x", method: "GET" } as Request,
      res,
      next,
    );
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ error: "Internal server error" });
  });

  it("initialises when SENTRY_DSN is set and scrubs sensitive fields", async () => {
    process.env.SENTRY_DSN =
      "https://examplePublicKey@o0.ingest.sentry.io/0";

    const captured: Array<Record<string, unknown>> = [];
    vi.doMock("@sentry/node", () => {
      let beforeSend: ((event: Record<string, unknown>) => unknown) | undefined;
      return {
        init: (opts: { beforeSend?: typeof beforeSend }) => {
          beforeSend = opts.beforeSend;
        },
        captureException: (_err: unknown) => {
          const event = {
            request: {
              headers: {
                authorization: "Bearer secret-jwt",
                Cookie: "session=abc",
                "x-trace": "ok",
              },
              data: {
                email: "u@test.com",
                password: "hunter2",
                refreshToken: "rt-xxxx",
                token: "verify-xxxx",
                credential: "google-id-token",
              },
            },
          };
          const out = beforeSend ? beforeSend(event) : event;
          if (out) captured.push(out as Record<string, unknown>);
        },
        withScope: (cb: (scope: { setTag: () => void }) => void) =>
          cb({ setTag: () => {} }),
      };
    });

    const mod = await import("../lib/sentry");
    mod.initSentry();
    expect(mod.isSentryEnabled()).toBe(true);

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      headersSent: false,
    } as unknown as Response;
    mod.sentryErrorHandler(
      new Error("kaboom"),
      { path: "/auth/login", method: "POST" } as Request,
      res,
      vi.fn() as unknown as NextFunction,
    );

    expect(captured).toHaveLength(1);
    const event = captured[0] as {
      request: {
        headers: Record<string, string>;
        data: Record<string, string>;
      };
    };
    expect(event.request.headers.authorization).toBe("[Filtered]");
    expect(event.request.headers.Cookie).toBe("[Filtered]");
    expect(event.request.headers["x-trace"]).toBe("ok");
    expect(event.request.data.password).toBe("[Filtered]");
    expect(event.request.data.refreshToken).toBe("[Filtered]");
    expect(event.request.data.token).toBe("[Filtered]");
    expect(event.request.data.credential).toBe("[Filtered]");
    expect(event.request.data.email).toBe("u@test.com"); // not in scrub list
  });
});
