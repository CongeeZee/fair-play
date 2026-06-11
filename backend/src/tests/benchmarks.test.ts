// Unit tests for lib/benchmarks — pure functions, no DB required.
// Covers the percentile maths, the 5-stroke band bucketing, and the
// small-sample cohort fallback that protects both statistical validity and
// privacy (a tiny cohort's percentiles would be trivially reversible).
import { describe, it, expect } from "vitest";
import {
  ALL_BAND,
  MIN_ABSOLUTE_SAMPLE,
  MIN_BAND_SAMPLE,
  PERCENTILE_STEPS,
  bandKeyForIndex,
  betterThanPercentile,
  buildSnapshotSummary,
  chooseCohort,
  quantile,
  rawPercentileOfValue,
  userMetricValues,
  type CohortSnapshot,
  type SnapshotSummary,
} from "../lib/benchmarks";
import type { MetricHoleInput } from "../lib/roundMetrics";

// ── Helpers ──────────────────────────────────────────────────────────────────

const hole = (over: Partial<MetricHoleInput> = {}): MetricHoleInput => ({
  par: 4,
  strokes: 5,
  putts: null,
  teeShotDirection: null,
  approachResult: null,
  ...over,
});

/** Summary for the values 1..n (uniform) — easy to reason about by hand. */
const uniformSummary = (n: number): SnapshotSummary =>
  buildSnapshotSummary(Array.from({ length: n }, (_, i) => i + 1))!;

const snap = (band: string, sampleSize: number): CohortSnapshot => ({
  band,
  sampleSize,
  summary: uniformSummary(Math.max(sampleSize, 2)),
});

// ── Band bucketing (5-stroke WHS buckets) ────────────────────────────────────

describe("bandKeyForIndex", () => {
  it("buckets indexes into half-open 5-stroke bands", () => {
    expect(bandKeyForIndex(0)).toBe("0-5");
    expect(bandKeyForIndex(4.9)).toBe("0-5");
    expect(bandKeyForIndex(5)).toBe("5-10"); // boundary belongs to the upper band
    expect(bandKeyForIndex(12.4)).toBe("10-15");
    expect(bandKeyForIndex(29.9)).toBe("25-30");
  });

  it("gives plus handicaps (index < 0) their own band", () => {
    expect(bandKeyForIndex(-1.2)).toBe("plus");
  });

  it("collapses 30.0+ into a single tail band", () => {
    expect(bandKeyForIndex(30)).toBe("30+");
    expect(bandKeyForIndex(54)).toBe("30+");
  });

  it("returns null for users with no handicap index", () => {
    expect(bandKeyForIndex(null)).toBeNull();
    expect(bandKeyForIndex(NaN)).toBeNull();
  });
});

// ── quantile ─────────────────────────────────────────────────────────────────

describe("quantile", () => {
  it("interpolates linearly between sorted values", () => {
    // [10, 20, 30, 40]: p50 → index 0.5×3 = 1.5 → 20 + 0.5×(30−20) = 25
    expect(quantile([10, 20, 30, 40], 0.5)).toBe(25);
    // p25 → index 0.75 → 10 + 0.75×10 = 17.5
    expect(quantile([10, 20, 30, 40], 0.25)).toBe(17.5);
  });

  it("returns exact elements at exact indices", () => {
    expect(quantile([1, 2, 3], 0)).toBe(1);
    expect(quantile([1, 2, 3], 0.5)).toBe(2);
    expect(quantile([1, 2, 3], 1)).toBe(3);
  });

  it("handles a single-element cohort", () => {
    expect(quantile([7], 0.05)).toBe(7);
    expect(quantile([7], 0.95)).toBe(7);
  });

  it("rejects empty input and out-of-range p", () => {
    expect(() => quantile([], 0.5)).toThrow();
    expect(() => quantile([1], 1.5)).toThrow();
  });
});

// ── Snapshot summary ─────────────────────────────────────────────────────────

describe("buildSnapshotSummary", () => {
  it("stores exactly the p5..p95 breakpoints — never min or max", () => {
    const summary = uniformSummary(100);
    expect(Object.keys(summary.percentiles).sort((a, b) => +a - +b)).toEqual(
      PERCENTILE_STEPS.map(String),
    );
    // p0/p100 (a single user's exact extreme value) must not be present.
    expect(summary.percentiles["0"]).toBeUndefined();
    expect(summary.percentiles["100"]).toBeUndefined();
  });

  it("computes hand-checkable breakpoints for 1..100", () => {
    // values 1..100, p50 → index 0.5×99 = 49.5 → (50 + 51)/2 = 50.5
    const summary = uniformSummary(100);
    expect(summary.percentiles["50"]).toBe(50.5);
    // p5 → index 0.05×99 = 4.95 → 5 + 0.95×1 = 5.95
    expect(summary.percentiles["5"]).toBe(5.95);
  });

  it("returns null for an empty cohort", () => {
    expect(buildSnapshotSummary([])).toBeNull();
  });

  it("does not mutate its input", () => {
    const values = [3, 1, 2];
    buildSnapshotSummary(values);
    expect(values).toEqual([3, 1, 2]);
  });
});

// ── Percentile of a value ────────────────────────────────────────────────────

describe("rawPercentileOfValue", () => {
  const summary = uniformSummary(100); // p50 = 50.5, roughly value ≈ percentile

  it("places the median value at ~p50", () => {
    expect(rawPercentileOfValue(summary, 50.5)).toBeCloseTo(50, 0);
  });

  it("interpolates between breakpoints", () => {
    // Between p50 (50.5) and p55 (55.45): value 52.975 is exactly halfway
    // → percentile 52.5.
    const mid =
      (summary.percentiles["50"] + summary.percentiles["55"]) / 2;
    expect(rawPercentileOfValue(summary, mid)).toBeCloseTo(52.5, 5);
  });

  it("clamps below p5 and above p95 — never claims sharper than top/bottom 5%", () => {
    expect(rawPercentileOfValue(summary, -1000)).toBe(5);
    expect(rawPercentileOfValue(summary, 1000)).toBe(95);
  });

  it("handles flat distributions (everyone has the same value)", () => {
    const flat = buildSnapshotSummary(Array(50).fill(2.0))!;
    const p = rawPercentileOfValue(flat, 2.0);
    expect(p).toBeGreaterThanOrEqual(5);
    expect(p).toBeLessThanOrEqual(95);
    expect(Number.isFinite(p)).toBe(true); // no divide-by-zero
  });
});

describe("betterThanPercentile", () => {
  const summary = uniformSummary(100);

  it("higher value = higher percentile when higher is better (e.g. girRate)", () => {
    expect(
      betterThanPercentile(summary, 90, false),
    ).toBeGreaterThan(betterThanPercentile(summary, 20, false));
  });

  it("inverts for lower-is-better metrics (scoreToPar, putts)", () => {
    // A LOW scoreToPar should read as a HIGH "better than" percentile.
    expect(betterThanPercentile(summary, 10, true)).toBeGreaterThan(
      betterThanPercentile(summary, 90, true),
    );
    // And the inversion stays within the clamped [5, 95] range.
    expect(betterThanPercentile(summary, -1000, true)).toBe(95);
    expect(betterThanPercentile(summary, 1000, true)).toBe(5);
  });

  it("returns an integer percentile", () => {
    expect(Number.isInteger(betterThanPercentile(summary, 33.3, false))).toBe(
      true,
    );
  });
});

// ── Small-sample cohort fallback ─────────────────────────────────────────────

describe("chooseCohort (small-sample fallback)", () => {
  it("uses the handicap band when it has enough users", () => {
    const chosen = chooseCohort(
      snap("10-15", MIN_BAND_SAMPLE),
      snap(ALL_BAND, 500),
    );
    expect(chosen?.cohort).toBe("band");
    expect(chosen?.snapshot.band).toBe("10-15");
  });

  it("falls back to all users when the band has < MIN_BAND_SAMPLE users", () => {
    const chosen = chooseCohort(
      snap("10-15", MIN_BAND_SAMPLE - 1),
      snap(ALL_BAND, 500),
    );
    expect(chosen?.cohort).toBe("all");
    expect(chosen?.snapshot.band).toBe(ALL_BAND);
  });

  it("falls back to all users when there is no band snapshot (no handicap)", () => {
    const chosen = chooseCohort(null, snap(ALL_BAND, 500));
    expect(chosen?.cohort).toBe("all");
  });

  it("returns null when even the all-users cohort is too small to be safe", () => {
    expect(chooseCohort(null, snap(ALL_BAND, MIN_ABSOLUTE_SAMPLE - 1))).toBeNull();
    expect(chooseCohort(snap("0-5", 2), null)).toBeNull();
  });
});

// ── Per-user metric values ───────────────────────────────────────────────────

describe("userMetricValues", () => {
  it("averages per-round values and excludes untracked rounds per metric", () => {
    const rounds = [
      // Round 1: 2 holes, +2 total, putts tracked (avg 2.5/hole).
      {
        holes: [
          hole({ strokes: 5, putts: 2 }),
          hole({ strokes: 5, putts: 3 }),
        ],
      },
      // Round 2: 2 holes, even par, putts NOT tracked.
      {
        holes: [hole({ strokes: 4 }), hole({ strokes: 4 })],
      },
    ];
    const values = userMetricValues(rounds, "mid");
    // scoreToPar: mean of (+2, 0) = +1
    expect(values.scoreToPar).toBe(1);
    // avgPutts: only round 1 tracked putts → 2.5 (round 2 carries no signal)
    expect(values.avgPutts).toBe(2.5);
    // GIR/fairways never tracked → null, so this user would be absent from
    // those cohort distributions entirely.
    expect(values.girRate).toBeNull();
    expect(values.fairwayRate).toBeNull();
  });

  it("includes SG categories only when their inputs were tracked", () => {
    const values = userMetricValues(
      [{ holes: [hole({ strokes: 4, approachResult: "gir", putts: 2 })] }],
      "mid",
    );
    expect(values.sgApproach).not.toBeNull();
    expect(values.sgPutting).not.toBeNull();
    expect(values.sgOffTheTee).toBeNull(); // no tee shot tracked
  });

  it("returns all nulls for a user with no scored holes", () => {
    const values = userMetricValues([{ holes: [] }], "mid");
    expect(Object.values(values).every((v) => v == null)).toBe(true);
  });
});
