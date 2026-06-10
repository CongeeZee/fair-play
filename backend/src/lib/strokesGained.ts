// ─────────────────────────────────────────────────────────────────────────────
// SIMPLIFIED STROKES GAINED MODEL
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠️ This is NOT true PGA ShotLink strokes gained. Real SG requires the start
// and end position of every shot (lie + distance to hole). Fairplay only
// tracks per-hole summary fields:
//
//   strokes, putts, teeShotDirection ('fairway'|'left'|'right'|'penalty'),
//   teeShotDistance ('short'|'on'|'long'), approachResult
//   ('gir'|'short'|'long'|'left'|'right'), sandShots, penalties, hazards
//
// So instead we estimate SG per category from OUTCOME PROXIES, measured
// against a baseline player in the same handicap band. The design goal is
// transparency over precision: every number used lives in the BASELINES
// table below and every formula is a one-liner you can audit.
//
// ── Category proxies and their assumptions ──────────────────────────────────
//
// PUTTING      SG = expectedPutts − actualPutts, per hole with tracked putts.
//              Assumption: expected putts is a flat per-hole number per band.
//              In reality expected putts depends on first-putt distance
//              (which we don't know), so a player who misses lots of greens
//              will face shorter first putts (after chipping close) and this
//              proxy will flatter them slightly. Holes where putts is null OR
//              0 are treated as untracked — the score-entry UI defaults to 0,
//              so a stored 0 is far more likely "not entered" than a holed
//              chip (same convention as GET /rounds/insights).
//
// OFF THE TEE  Only par 4s / par 5s with a tracked teeShotDirection (driving
//              holes; par-3 tee shots are approaches). Each outcome is worth
//              a fixed stroke value relative to the band's expected tee shot:
//                fairway        → +(1 − fairwayRate) × fairwayValue
//                left / right   → −fairwayRate × fairwayValue
//                penalty        → −fairwayRate × fairwayValue − penaltyCost
//              By construction a player who hits fairways at exactly the band
//              baseline rate (with no penalties) nets ~0. fairwayValue is the
//              approximate stroke cost of rough/trees vs fairway; penaltyCost
//              the extra cost of a penalty drive. Assumption: all non-fairway,
//              non-penalty misses cost the same (we can't tell light rough
//              from jail). teeShotDistance is deliberately unused: a
//              short/on/long bucket without knowing hole length or club says
//              nothing reliable about strokes.
//
// APPROACH     Any hole with a tracked approachResult:
//                gir  → +(1 − girRate) × girValue
//                miss → −girRate × girValue
//              Nets to ~0 for a player at the band's baseline GIR rate.
//              girValue approximates the stroke difference between holing out
//              from on the green vs from just off it. Assumption: all misses
//              (short/long/left/right) are equally costly — we don't know
//              short-siding or distance, so direction is ignored here (the
//              insights endpoint already surfaces miss-direction patterns).
//
// AROUND GREEN Holes where the approach MISSED the green (tracked
//              approachResult ≠ 'gir'). Proxy = scrambling:
//                saved par or better → +(1 − scrambleRate) × scrambleValue
//                bogey or worse      → −scrambleRate × scrambleValue
//              Plus −extraSandShotCost for every recorded sand shot beyond
//              the first (needing 2+ to escape a bunker is a clear
//              around-the-green loss). Assumptions: scrambling is attributed
//              entirely to the short game even though it partly reflects
//              putting (a known double-count with the putting category — we
//              accept it and say so rather than invent shot data); a scramble
//              is "strokes ≤ par", which on a par 5 could include a layup —
//              acceptable noise at this granularity.
//
// NOT modelled: hazards (ambiguous — a hazard need not cost a stroke),
// penalties field outside the tee ball (we can't place them in a category;
// teeShotDirection === 'penalty' already captures penalty drives), and
// teeShotDistance (see above). We do NOT invent data we don't have.
//
// The four categories will NOT sum exactly to score-vs-baseline. That's
// expected for a proxy model; totalVsBaseline is reported separately so the
// gap is visible rather than hidden.
// ─────────────────────────────────────────────────────────────────────────────

// ── Handicap bands ───────────────────────────────────────────────────────────

export type HandicapBand = "low" | "mid" | "high";

/**
 * Map a handicap index to a baseline band.
 * null (no handicap yet) defaults to "mid" — the safest central assumption.
 */
export function bandForHandicap(handicapIndex: number | null): HandicapBand {
  if (handicapIndex == null) return "mid";
  if (handicapIndex < 8) return "low";
  if (handicapIndex <= 18) return "mid";
  return "high";
}

// ── Baseline tables — SINGLE PLACE TO TUNE ───────────────────────────────────
//
// All numbers are deliberately round approximations of published amateur
// statistics (e.g. Broadie, "Every Shot Counts"; USGA/Arccos amateur data),
// NOT measured constants. Tune freely — but note the unit tests contain
// hand-checked fixtures against the DEFAULT mid-band values below, so if you
// retune this table, update those literals too (the formula tests use an
// injected baseline and are tuning-independent).

export interface BandBaseline {
  /** Expected strokes on a hole of given par for this band. Keyed by par. */
  expectedScoreByPar: Record<number, number>;
  /** Expected putts per hole (flat — see putting assumptions above). */
  expectedPutts: number;
  /** Baseline fairways-hit rate on par 4/5 driving holes. */
  fairwayRate: number;
  /** Baseline greens-in-regulation rate. */
  girRate: number;
  /** Baseline scramble (par-or-better after missed green) rate. */
  scrambleRate: number;
  /** Approx. stroke cost of missing the fairway (rough/trees vs fairway). */
  fairwayValue: number;
  /** Approx. extra stroke cost of a penalty tee shot (stroke + distance). */
  penaltyCost: number;
  /** Approx. stroke difference: holing out from on vs just off the green. */
  girValue: number;
  /** Approx. stroke swing attributed to short game for a scramble. */
  scrambleValue: number;
  /** Cost per sand shot beyond the first on a hole (failed escapes). */
  extraSandShotCost: number;
}

export const BASELINES: Record<HandicapBand, BandBaseline> = {
  // ~scratch to 7.9 index. expectedScoreByPar sums to ≈ +5 over a standard
  // 18 (4× par 3, 10× par 4, 4× par 5).
  low: {
    expectedScoreByPar: { 3: 3.2, 4: 4.3, 5: 5.3 },
    expectedPutts: 1.85,
    fairwayRate: 0.55,
    girRate: 0.45,
    scrambleRate: 0.4,
    fairwayValue: 0.25,
    penaltyCost: 1.0,
    girValue: 0.8,
    scrambleValue: 0.6,
    extraSandShotCost: 0.5,
  },
  // 8–18 index. Sums to ≈ +13 over a standard 18.
  mid: {
    expectedScoreByPar: { 3: 3.7, 4: 4.7, 5: 5.75 },
    expectedPutts: 2.0,
    fairwayRate: 0.45,
    girRate: 0.3,
    scrambleRate: 0.25,
    fairwayValue: 0.3,
    penaltyCost: 1.0,
    girValue: 0.9,
    scrambleValue: 0.6,
    extraSandShotCost: 0.5,
  },
  // 18.1+ index. Sums to ≈ +23 over a standard 18.
  high: {
    expectedScoreByPar: { 3: 4.1, 4: 5.3, 5: 6.4 },
    expectedPutts: 2.15,
    fairwayRate: 0.4,
    girRate: 0.15,
    scrambleRate: 0.15,
    fairwayValue: 0.35,
    penaltyCost: 1.0,
    girValue: 1.0,
    scrambleValue: 0.6,
    extraSandShotCost: 0.5,
  },
};

/**
 * Fallback expected score for non-standard pars (par 6 etc.): par plus the
 * band's average par-4 overage. Keeps the model defined on unusual courses
 * without pretending we have data for them.
 */
function expectedScore(baseline: BandBaseline, par: number): number {
  const exact = baseline.expectedScoreByPar[par];
  if (exact != null) return exact;
  const par4Overage = baseline.expectedScoreByPar[4] - 4;
  return par + par4Overage;
}

// ── Inputs / outputs ─────────────────────────────────────────────────────────

/** The per-hole fields the model consumes — mirrors RoundHole + Hole.par. */
export interface SGHoleInput {
  par: number;
  strokes: number;
  putts?: number | null;
  teeShotDirection?: string | null; // 'fairway' | 'left' | 'right' | 'penalty'
  approachResult?: string | null; // 'gir' | 'short' | 'long' | 'left' | 'right'
  sandShots?: number | null;
}

export type SGCategory = "offTheTee" | "approach" | "aroundGreen" | "putting";

export const SG_CATEGORIES: SGCategory[] = [
  "offTheTee",
  "approach",
  "aroundGreen",
  "putting",
];

export interface CategoryResult {
  /** Total estimated strokes gained for the round; null if nothing tracked. */
  value: number | null;
  /** Holes that actually contributed (had the required tracked inputs). */
  trackedHoles: number;
}

export interface RoundStrokesGained {
  offTheTee: CategoryResult;
  approach: CategoryResult;
  aroundGreen: CategoryResult;
  putting: CategoryResult;
  /**
   * expectedScore(par) − strokes summed over all holes. Always computable
   * (needs only strokes + par). Reported so the gap between the proxy
   * categories and reality stays visible.
   */
  totalVsBaseline: number;
  holesPlayed: number;
}

// ── Core computation ─────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Estimate strokes gained for one round's holes against a handicap-band
 * baseline. Pure function — all tunables come from `baselines` (defaults to
 * BASELINES) so tests and future per-user calibration can inject their own.
 */
export function computeRoundStrokesGained(
  holes: SGHoleInput[],
  band: HandicapBand,
  baselines: Record<HandicapBand, BandBaseline> = BASELINES,
): RoundStrokesGained {
  const b = baselines[band];

  const totals: Record<SGCategory, { sum: number; tracked: number }> = {
    offTheTee: { sum: 0, tracked: 0 },
    approach: { sum: 0, tracked: 0 },
    aroundGreen: { sum: 0, tracked: 0 },
    putting: { sum: 0, tracked: 0 },
  };
  let totalVsBaseline = 0;

  for (const h of holes) {
    totalVsBaseline += expectedScore(b, h.par) - h.strokes;

    // ── Putting ── putts null/0 = untracked (UI default is 0; see header).
    if (h.putts != null && h.putts > 0) {
      totals.putting.sum += b.expectedPutts - h.putts;
      totals.putting.tracked += 1;
    }

    // ── Off the tee ── driving holes (par ≥ 4) with a tracked direction.
    if (h.par >= 4 && h.teeShotDirection) {
      const dir = h.teeShotDirection;
      if (dir === "fairway") {
        totals.offTheTee.sum += (1 - b.fairwayRate) * b.fairwayValue;
      } else if (dir === "penalty") {
        totals.offTheTee.sum += -b.fairwayRate * b.fairwayValue - b.penaltyCost;
      } else {
        // 'left' or 'right' — any non-fairway miss costs the same (we can't
        // distinguish light rough from trouble).
        totals.offTheTee.sum += -b.fairwayRate * b.fairwayValue;
      }
      totals.offTheTee.tracked += 1;
    }

    // ── Approach ── any hole with a tracked result.
    if (h.approachResult) {
      totals.approach.sum +=
        h.approachResult === "gir"
          ? (1 - b.girRate) * b.girValue
          : -b.girRate * b.girValue;
      totals.approach.tracked += 1;
    }

    // ── Around the green ── only holes where we KNOW the green was missed.
    // Holes without approachResult are excluded entirely: we can't tell a
    // missed green from an untracked one, and we don't invent data.
    if (h.approachResult && h.approachResult !== "gir") {
      const scrambled = h.strokes <= h.par;
      totals.aroundGreen.sum += scrambled
        ? (1 - b.scrambleRate) * b.scrambleValue
        : -b.scrambleRate * b.scrambleValue;
      // Failed bunker escapes: every sand shot beyond the first costs extra.
      const extraSand = Math.max(0, (h.sandShots ?? 0) - 1);
      totals.aroundGreen.sum -= extraSand * b.extraSandShotCost;
      totals.aroundGreen.tracked += 1;
    }
  }

  const result = (c: SGCategory): CategoryResult => ({
    value: totals[c].tracked > 0 ? round2(totals[c].sum) : null,
    trackedHoles: totals[c].tracked,
  });

  return {
    offTheTee: result("offTheTee"),
    approach: result("approach"),
    aroundGreen: result("aroundGreen"),
    putting: result("putting"),
    totalVsBaseline: round2(totalVsBaseline),
    holesPlayed: holes.length,
  };
}

// ── Data completeness ────────────────────────────────────────────────────────

/**
 * Minimum tracked holes (across the analysed window) before a category's
 * average is presented as trustworthy. 18 ≈ one full round of tracked data.
 * Below this the endpoint still returns the number but flags it.
 */
export const MIN_TRACKED_HOLES = 18;
