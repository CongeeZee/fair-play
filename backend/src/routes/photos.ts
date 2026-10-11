import express, { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { moderateLimiter } from "../middleware/rateLimiter";

const router = Router();

/** The client resizes to 320px before upload; this leaves generous headroom. */
const MAX_BYTES = 512 * 1024;

/**
 * userId -> photo version (updatedAt in ms), for every user who has a photo.
 *
 * Avatars appear on almost every screen, for every person on it. Asking the
 * database "does this user have a photo?" per avatar would add a round-trip to
 * each page, so the answer is kept in memory: loaded once, kept current by the
 * upload/delete routes below, and reloaded periodically so a second instance's
 * changes still show up within a few minutes.
 */
let versions: Map<number, number> | null = null;
let loadedAt = 0;
let loading: Promise<Map<number, number>> | null = null;
const RELOAD_MS = 5 * 60 * 1000;

async function getVersions(): Promise<Map<number, number>> {
  if (versions && Date.now() - loadedAt < RELOAD_MS) return versions;
  if (!loading) {
    loading = prisma.profilePhoto
      .findMany({ select: { userId: true, updatedAt: true } })
      .then((rows) => {
        versions = new Map(rows.map((r) => [r.userId, r.updatedAt.getTime()]));
        loadedAt = Date.now();
        return versions;
      })
      .finally(() => {
        loading = null;
      });
  }
  // Serve the previous map while a reload is in flight, if there is one
  return versions ?? loading;
}

/** Test hook: forget the in-memory map. */
export function resetPhotoVersionCache() {
  versions = null;
  loadedAt = 0;
}

/** Identify the format from the file's first bytes rather than trusting a header. */
function sniff(buf: Buffer): string | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

// GET /photos/versions?ids=1,2,3 — which of these users have a photo, and its version.
// Public: it reveals only that a photo exists, which the avatar itself shows anyway.
router.get("/versions", async (req: Request, res: Response) => {
  const ids = String(req.query.ids || "")
    .split(",")
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n))
    .slice(0, 200);
  try {
    const map = await getVersions();
    const out: Record<number, number> = {};
    for (const id of ids) {
      const v = map.get(id);
      if (v) out[id] = v;
    }
    res.setHeader("Cache-Control", "private, max-age=60");
    res.json(out);
  } catch (err) {
    console.error("GET /photos/versions error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /photos/:userId?v=<version> — the image. Public, so a plain <img> can load
// it without an auth header. A versioned URL never changes content, so it is
// cached for a year; a new upload gets a new version and therefore a new URL.
router.get("/:userId", async (req: Request, res: Response) => {
  const userId = parseInt(String(req.params.userId), 10);
  if (!Number.isFinite(userId)) {
    res.status(400).json({ error: "Invalid user" });
    return;
  }
  try {
    const photo = await prisma.profilePhoto.findUnique({ where: { userId } });
    if (!photo) {
      res.status(404).json({ error: "No photo" });
      return;
    }
    const versioned = req.query.v != null && Number(req.query.v) === photo.updatedAt.getTime();
    res.setHeader("Content-Type", photo.mimeType);
    res.setHeader("Cache-Control", versioned ? "public, max-age=31536000, immutable" : "public, max-age=300");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(Buffer.from(photo.data));
  } catch (err) {
    console.error("GET /photos/:userId error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /photos/me — upload or replace your photo. Body is the raw image bytes.
router.put(
  "/me",
  requireAuth,
  moderateLimiter,
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: MAX_BYTES }),
  async (req: AuthRequest, res: Response) => {
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: "Send a JPEG, PNG or WebP image" });
      return;
    }
    const mimeType = sniff(body);
    if (!mimeType) {
      res.status(400).json({ error: "That file isn't a JPEG, PNG or WebP image" });
      return;
    }
    // Copy into a plain ArrayBuffer-backed array, which is what Prisma's Bytes takes
    const data = new Uint8Array(body);
    try {
      const photo = await prisma.profilePhoto.upsert({
        where: { userId: req.userId! },
        create: { userId: req.userId!, data, mimeType },
        update: { data, mimeType },
        select: { updatedAt: true },
      });
      const version = photo.updatedAt.getTime();
      (await getVersions()).set(req.userId!, version);
      res.json({ version });
    } catch (err) {
      console.error("PUT /photos/me error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// DELETE /photos/me — remove your photo (back to initials).
router.delete("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.profilePhoto.deleteMany({ where: { userId: req.userId! } });
    (await getVersions()).delete(req.userId!);
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /photos/me error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
