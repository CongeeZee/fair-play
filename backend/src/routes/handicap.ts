import { Router, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

// ── Lookup endpoints ────────────────────────────────────────────────────────

// GET /handicap/lookup/golf-australia/:golfLinkNo
// Fetches handicap from Golf Australia's public page
router.get("/lookup/golf-australia/:golfLinkNo", async (req: AuthRequest, res: Response) => {
  const golfLinkNo = String(req.params.golfLinkNo).replace(/\s/g, "");

  if (!/^\d{10}$/.test(golfLinkNo)) {
    res.status(400).json({ error: "Golf ID must be a 10-digit number" });
    return;
  }

  try {
    const result = await lookupGolfAustralia(golfLinkNo);
    if (!result) {
      res.status(404).json({ error: "Golfer not found. Check your Golf ID number." });
      return;
    }
    res.json(result);
  } catch (err) {
    console.error("Golf Australia lookup error:", err);
    res.status(502).json({ error: "Unable to fetch handicap from Golf Australia. Try again later." });
  }
});

// GET /handicap/lookup/ghin/:ghinNumber
// Fetches handicap from GHIN (USGA) public lookup
router.get("/lookup/ghin/:ghinNumber", async (req: AuthRequest, res: Response) => {
  const ghinNumber = String(req.params.ghinNumber).replace(/\s/g, "");

  if (!/^\d{7,8}$/.test(ghinNumber)) {
    res.status(400).json({ error: "GHIN number must be 7 or 8 digits" });
    return;
  }

  try {
    const result = await lookupGHIN(ghinNumber);
    if (!result) {
      res.status(404).json({ error: "Golfer not found. Check your GHIN number." });
      return;
    }
    res.json(result);
  } catch (err) {
    console.error("GHIN lookup error:", err);
    res.status(502).json({ error: "Unable to fetch handicap from GHIN. Try again later." });
  }
});

// ── Link/Unlink endpoints ───────────────────────────────────────────────────

const linkSchema = z.object({
  source: z.enum(["golf_australia", "ghin", "manual"]),
  externalId: z.string().optional(),
  handicapIndex: z.number().min(-10).max(54),
  playerName: z.string().optional(),
  clubName: z.string().optional(),
});

// POST /handicap/link — save linked handicap to user profile
router.post("/link", async (req: AuthRequest, res: Response) => {
  const parsed = linkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  const { source, externalId, handicapIndex, playerName, clubName } = parsed.data;

  try {
    const linked = await prisma.linkedHandicap.upsert({
      where: { userId: req.userId! },
      update: {
        source,
        externalId: externalId || null,
        handicapIndex,
        playerName: playerName || null,
        clubName: clubName || null,
        lastSynced: new Date(),
      },
      create: {
        userId: req.userId!,
        source,
        externalId: externalId || null,
        handicapIndex,
        playerName: playerName || null,
        clubName: clubName || null,
      },
    });

    res.json(linked);
  } catch (err) {
    console.error("POST /handicap/link error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /handicap/linked — get current linked handicap
router.get("/linked", async (req: AuthRequest, res: Response) => {
  try {
    const linked = await prisma.linkedHandicap.findUnique({
      where: { userId: req.userId! },
    });
    res.json(linked);
  } catch (err) {
    console.error("GET /handicap/linked error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /handicap/link — unlink handicap
router.delete("/link", async (req: AuthRequest, res: Response) => {
  try {
    await prisma.linkedHandicap.deleteMany({
      where: { userId: req.userId! },
    });
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /handicap/link error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /handicap/refresh — re-fetch handicap from external source
router.post("/refresh", async (req: AuthRequest, res: Response) => {
  try {
    const linked = await prisma.linkedHandicap.findUnique({
      where: { userId: req.userId! },
    });

    if (!linked || !linked.externalId) {
      res.status(404).json({ error: "No linked handicap to refresh" });
      return;
    }

    let result: LookupResult | null = null;

    if (linked.source === "golf_australia") {
      result = await lookupGolfAustralia(linked.externalId);
    } else if (linked.source === "ghin") {
      result = await lookupGHIN(linked.externalId);
    }

    if (!result) {
      res.status(502).json({ error: "Unable to refresh handicap. The external service may be unavailable." });
      return;
    }

    const updated = await prisma.linkedHandicap.update({
      where: { userId: req.userId! },
      data: {
        handicapIndex: result.handicapIndex,
        playerName: result.playerName || linked.playerName,
        clubName: result.clubName || linked.clubName,
        lastSynced: new Date(),
      },
    });

    res.json(updated);
  } catch (err) {
    console.error("POST /handicap/refresh error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Lookup helpers ───────────��──────────────────────────────────────────────

interface LookupResult {
  handicapIndex: number;
  playerName?: string;
  clubName?: string;
}

async function lookupGolfAustralia(golfLinkNo: string): Promise<LookupResult | null> {
  // Golf Australia's public handicap page renders the handicap for any Golf ID
  const url = `https://www.golf.org.au/handicap/?golfLinkNo=${golfLinkNo}`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Fairplay/1.0)",
      "Accept": "text/html",
    },
  });

  if (!resp.ok) return null;

  const html = await resp.text();

  // Parse handicap index from the page
  // The page typically shows the handicap in a format like "GA Handicap: 12.3"
  // or within structured data. We look for common patterns.
  const handicapMatch = html.match(
    /(?:handicap\s*(?:index)?|ga\s*handicap)\s*[:\s]*([+-]?\d+\.?\d*)/i
  ) || html.match(
    /(?:handicapIndex|handicap_index)["'\s:]+([+-]?\d+\.?\d*)/i
  ) || html.match(
    /class="[^"]*handicap[^"]*"[^>]*>([+-]?\d+\.?\d*)/i
  );

  if (!handicapMatch) return null;

  const handicapIndex = parseFloat(handicapMatch[1]);
  if (isNaN(handicapIndex)) return null;

  // Try to extract player name
  const nameMatch = html.match(
    /(?:player|golfer|member)\s*(?:name)?\s*[:\s]*([A-Z][a-z]+ [A-Z][a-z]+)/i
  ) || html.match(
    /(?:playerName|player_name|golferName)["'\s:]+([^"'<]+)/i
  );

  // Try to extract club name
  const clubMatch = html.match(
    /(?:club|home\s*club)\s*[:\s]*([^<\n]+)/i
  ) || html.match(
    /(?:clubName|club_name)["'\s:]+([^"'<]+)/i
  );

  return {
    handicapIndex,
    playerName: nameMatch?.[1]?.trim(),
    clubName: clubMatch?.[1]?.trim(),
  };
}

async function lookupGHIN(ghinNumber: string): Promise<LookupResult | null> {
  // GHIN has a public-facing API used by their lookup page
  const url = `https://api2.ghin.com/api/v1/golfers.json?golfer_id=${ghinNumber}&from_ghin=true`;

  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Fairplay/1.0)",
      "Accept": "application/json",
    },
  });

  if (!resp.ok) return null;

  const data = await resp.json() as {
    golfers?: Array<{
      handicap_index?: string;
      first_name?: string;
      last_name?: string;
      club_name?: string;
    }>;
  };

  const golfer = data.golfers?.[0];
  if (!golfer || golfer.handicap_index == null) return null;

  const handicapIndex = parseFloat(golfer.handicap_index);
  if (isNaN(handicapIndex)) return null;

  const playerName = [golfer.first_name, golfer.last_name].filter(Boolean).join(" ") || undefined;

  return {
    handicapIndex,
    playerName,
    clubName: golfer.club_name || undefined,
  };
}

export default router;
