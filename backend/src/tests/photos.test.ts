import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createVerifiedTestUser } from "./setup";

vi.mock("../lib/email", () => ({ sendVerificationEmail: vi.fn() }));
vi.mock("../middleware/rateLimiter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../middleware/rateLimiter")>();
  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return Object.fromEntries(Object.keys(actual).map((name) => [name, passthrough]));
});

const { default: app } = await import("../app");
const { resetPhotoVersionCache } = await import("../routes/photos");

// Smallest valid-looking files: the route checks magic bytes, not full decoding
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 2)]);

describe("profile photos", () => {
  beforeEach(() => resetPhotoVersionCache());

  it("uploads, serves with a long-lived versioned URL, and lists the version", async () => {
    const u = await createVerifiedTestUser();
    const up = await request(app).put("/photos/me").set("Authorization", `Bearer ${u.accessToken}`)
      .set("Content-Type", "image/jpeg").send(JPEG);
    expect(up.status).toBe(200);
    const v = up.body.version as number;

    const versions = await request(app).get(`/photos/versions?ids=${u.id},999999`);
    expect(versions.body).toEqual({ [u.id]: v });

    const img = await request(app).get(`/photos/${u.id}?v=${v}`);
    expect(img.status).toBe(200);
    expect(img.headers["content-type"]).toBe("image/jpeg");
    expect(img.headers["cache-control"]).toContain("immutable");
    expect(Buffer.compare(img.body, JPEG)).toBe(0);
  });

  it("replaces the photo with a new version, and deletes it", async () => {
    const u = await createVerifiedTestUser();
    const auth = { Authorization: `Bearer ${u.accessToken}` };
    const a = await request(app).put("/photos/me").set(auth).set("Content-Type", "image/jpeg").send(JPEG);
    await new Promise((r) => setTimeout(r, 5));
    const b = await request(app).put("/photos/me").set(auth).set("Content-Type", "image/png").send(PNG);
    expect(b.body.version).toBeGreaterThan(a.body.version);
    expect((await request(app).get(`/photos/${u.id}`)).headers["content-type"]).toBe("image/png");

    await request(app).delete("/photos/me").set(auth);
    expect((await request(app).get(`/photos/${u.id}`)).status).toBe(404);
    expect((await request(app).get(`/photos/versions?ids=${u.id}`)).body).toEqual({});
  });

  it("rejects files that aren't images, oversized uploads, and anonymous uploads", async () => {
    const u = await createVerifiedTestUser();
    const auth = { Authorization: `Bearer ${u.accessToken}` };
    const fake = await request(app).put("/photos/me").set(auth).set("Content-Type", "image/jpeg").send(Buffer.from("<svg onload=alert(1)>"));
    expect(fake.status).toBe(400);
    const huge = await request(app).put("/photos/me").set(auth).set("Content-Type", "image/jpeg")
      .send(Buffer.concat([JPEG, Buffer.alloc(600 * 1024)]));
    expect(huge.status).toBe(413);
    const anon = await request(app).put("/photos/me").set("Content-Type", "image/jpeg").send(JPEG);
    expect(anon.status).toBe(401);
  });
});

describe("client errors from body parsing", () => {
  it("answers malformed JSON with 400, not 500", async () => {
    const res = await request(app).post("/auth/login").set("Content-Type", "application/json").send('{"email":');
    expect(res.status).toBe(400);
  });
});
