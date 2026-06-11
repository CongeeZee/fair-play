// ─────────────────────────────────────────────────────────────────────────────
// SHARED PER-ROUND METRIC CALCULATIONS
// ─────────────────────────────────────────────────────────────────────────────
//
// Single home for the metric maths used by /rounds/stats, /rounds/insights and
// /rounds/trends so the three endpoints can never drift apart (previously
// scoreToPar / GIR / fairway / putting logic was duplicated inline per route).
//
// Conventions (must match what the score-entry UI writes):
//   • A hole's putts are "tracked" only when putts != null && putts > 0.
//     putts === 0 is treated as untracked, not a holed approach shot.
//   • GIR is tracked when approachResult != null; "gir" counts as a hit.
//   • Fairways only exist on par 4/5: tracked when teeShotDirection != null,
//     hit when it equals "fairway". Par 3s never count either way.
//   • All rates are 0..1 fractions, rounded to 2dp at the response boundary
//     (not here) unless stated otherwise.
// ─────────────────────────────────────────────────────────────────────────────

import {
  bandForHandicap,
  computeRoundStrokesGained,
  HandicapBand,
  SGHoleInput,
} from "./strokesGained";

// Minimal hole shape needed by every metric. sandShots is only consumed by the
// strokes-gained metric and may be omitted elsewhere.
export interface MetricHoleInput {
  par: number;
  strokes: number;
  putts: number | null;
  teeShotDirection: string | null;
  approachResult: string | null;
  sandShots?: number | null;
}

// ── Shared summaries (used by /stats, /insights and /trends) ────────────────

/** Total strokes minus total par. Null when no holes were scored. */
export function roundScoreToPar(holes: MetricHoleInput[]): number | null {
  if (holes.length === 0) return null;
  const strokes = holes.reduce((s, h) => s + h.strokes, 0);
  const par = holes.reduce((s, h) => s + h.par, 0);
  return strokes - par;
}

/** Eagle-or-better / birdie / par / bogey / double+ counts across holes. */
export function holeBreakdown(holes: MetricHoleInput[]) {
  let eagles = 0,
    birdies = 0,
    pars = 0,
    bogeys = 0,
    doublesOrWorse = 0;
  for (const h of holes) {
    const diff = h.strokes - h.par;
    if (diff <= -2) eagles++;
    else if (diff === -1) birdies++;
    else if (diff === 0) pars++;
    else if (diff === 1) bogeys++;
    else doublesOrWorse++;
  }
  return { eagles, birdies, pars, bogeys, doublesOrWorse };
}

/** Average putts per tracked hole and 3-putt rate. Nulls when untracked. */
export function summarisePutting(holes: MetricHoleInput[]) {
  const tracked = holes.filter((h) => h.putts != null && h.putts > 0);
  const avgPutts =
    tracked.length > 0
      ? tracked.reduce((s, h) => s + h.putts!, 0) / tracked.length
      : null;
  const threePuttRate =
    tracked.length > 0
      ? tracked.filter((h) => h.putts! >= 3).length / tracked.length
      : null;
  return { tracked: tracked.length, avgPutts, threePuttRate };
}

/** GIR rate plus a breakdown of where misses went. Nulls when untracked. */
export function summariseApproach(holes: MetricHoleInput[]) {
  const tracked = holes.filter((h) => h.approachResult != null);
  const girRate =
    tracked.length > 0
      ? tracked.filter((h) => h.approachResult === "gir").length / tracked.length
      : null;
  const count = (dir: string) =>
    tracked.filter((h) => h.approachResult === dir).length;
  const misses = {
    left: count("left"),
    right: count("right"),
    short: count("short"),
    long: count("long"),
  };
  return {
    tracked: tracked.length,
    girRate,
    misses: {
      ...misses,
      total: misses.left + misses.right + misses.short + misses.long,
    },
  };
}

/** Fairway-hit rate on par 4/5 holes with a tracked tee shot. */
export function summariseTeeShots(holes: MetricHoleInput[]) {
  const tracked = holes.filter(
    (h) => h.par >= 4 && h.teeShotDirection != null,
  );
  const fairwayRate =
    tracked.length > 0
      ? tracked.filter((h) => h.teeShotDirection === "fairway").length /
        tracked.length
      : null;
  return { tracked: tracked.length, fairwayRate };
}

// ── Trend metrics ────────────────────────────────────────────────────────────

export const TREND_METRICS = [
  "scoreToPar",
  "putts",
  "girRate",
  "fairwayRate",
  "strokesGained",
] as const;
export type TrendMetric = (typeof TREND_METRICS)[number];

export interface TrendMetricConfig {
  /** Whether a rising value means the player is getting better. */
  higherIsBetter: boolean;
  /**
   * |delta| at or below this is reported as "stable". Units are the metric's
   * own units, so thresholds differ: half a stroke of scoreToPar is noise,
   * but half a stroke of GIR rate would be absurd.
   */
  stableThreshold: number;
  /** Decimal places used when rounding series/delta values for the response. */
  decimals: number;
}

export const TREND_METRIC_CONFIG: Record<TrendMetric, TrendMetricConfig> = {
  // Per-round score vs par. Lower is better. ±0.5 strokes between two
  // 5-round windows is within normal scoring noise.
  scoreToPar: { higherIsBetter: false, stableThreshold: 0.5, decimals: 1 },
  // Average putts per TRACKED HOLE (not per round — 9- and 18-hole rounds
  // must be comparable). Lower is better.
  putts: { higherIsBetter: false, stableThreshold: 0.05, decimals: 2 },
  // Fraction 0..1. Higher is better.
  girRate: { higherIsBetter: true, stableThreshold: 0.02, decimals: 2 },
  // Fraction 0..1. Higher is better.
  fairwayRate: { higherIsBetter: true, stableThreshold: 0.02, decimals: 2 },
  // Per-round total strokes gained vs the player's handicap-band baseline
  // (totalVsBaseline from lib/strokesGained). Higher is better.
  strokesGained: { higherIsBetter: true, stableThreshold: 0.5, decimals: 2 },
};

/**
 * The per-round value for one trend metric, or null when the round didn't
 * track the data the metric needs. Null rounds are EXCLUDED from the trend
 * series (a round where you didn't count putts says nothing about putting).
 */
export function roundMetricValue(
  metric: TrendMetric,
  holes: MetricHoleInput[],
  band: HandicapBand,
): number | null {
  if (holes.length === 0) return null;
  switch (metric) {
    case "scoreToPar":
      return roundScoreToPar(holes);
    case "putts":
      return summarisePutting(holes).avgPutts;
    case "girRate":
      return summariseApproach(holes).girRate;
    case "fairwayRate":
      return summariseTeeShots(holes).fairwayRate;
    case "strokesGained": {
      // totalVsBaseline only depends on strokes + par, which every scored
      // hole has, so this is never null for a scored round.
      const sgHoles: SGHoleInput[] = holes.map((h) => ({
        par: h.par,
        strokes: h.strokes,
        putts: h.putts,
        teeShotDirection: h.teeShotDirection,
        approachResult: h.approachResult,
        sandShots: h.sandShots ?? null,
      }));
      return computeRoundStrokesGained(sgHoles, band).totalVsBaseline;
    }
  }
}

// ── Rolling average ──────────────────────────────────────────────────────────

/**
 * Trailing rolling average. Entry i is the mean of values[i-window+1 .. i],
 * and is null until a full window exists (a "5-round average" computed from
 * 2 rounds is misleading, so we don't emit one). Output length === input
 * length. Window must be >= 1.
 */
export function rollingAverage(
  values: number[],
  window: number,
): Array<number | null> {
  if (window < 1) throw new Error("rollingAverage: window must be >= 1");
  const out: Array<number | null> = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window]; // slide: drop the value that left the window
    out.push(i >= window - 1 ? sum / window : null);
  }
  return out;
}

// ── Last-N vs previous-N delta ───────────────────────────────────────────────

export type TrendDirection = "improving" | "declining" | "stable";

export interface TrendDelta {
  /** mean(last N) - mean(previous N), in the metric's own units. */
  value: number;
  /** abs(value) — convenience for UI display. */
  magnitude: number;
  direction: TrendDirection;
  lastAvg: number;
  previousAvg: number;
  /** N — how many rounds each side of the comparison used. */
  window: number;
}

/**
 * Compare the most recent `window` values against the `window` before them.
 * Returns null when there aren't 2×window values — comparing a full window
 * against a partial one would bias the delta. Direction respects the metric's
 * higherIsBetter flag, and |delta| <= stableThreshold reads as "stable" so
 * normal round-to-round noise isn't reported as a trend.
 *
 * `values` must be chronological (oldest → newest).
 */
export function computeTrendDelta(
  values: number[],
  window: number,
  config: TrendMetricConfig,
): TrendDelta | null {
  if (window < 1) throw new Error("computeTrendDelta: window must be >= 1");
  if (values.length < window * 2) return null;

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const last = values.slice(-window);
  const previous = values.slice(-window * 2, -window);

  const lastAvg = mean(last);
  const previousAvg = mean(previous);
  const value = lastAvg - previousAvg;

  let direction: TrendDirection;
  if (Math.abs(value) <= config.stableThreshold) direction = "stable";
  else if (value > 0) direction = config.higherIsBetter ? "improving" : "declining";
  else direction = config.higherIsBetter ? "declining" : "improving";

  return {
    value,
    magnitude: Math.abs(value),
    direction,
    lastAvg,
    previousAvg,
    window,
  };
}

export { bandForHandicap };
