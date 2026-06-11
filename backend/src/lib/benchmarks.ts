// ─────────────────────────────────────────────────────────────────────────────
// ANONYMISED PEER BENCHMARKING
// ─────────────────────────────────────────────────────────────────────────────
//
// Powers GET /rounds/benchmarks: "how does my game compare to similar players?"
//
// PRIVACY MODEL (the most important invariant in this file):
//   • Cohort data is only ever stored and served as AGGREGATE STATISTICS —
//     percentile breakpoints (p5..p95) per (band, metric). No user ids, no
//     raw round data, no per-user values ever leave this module.
//   • Reported percentiles are clamped to [5, 95]. Returning p0/p100 (min/max)
//     would expose a single identifiable extreme — "the best player's exact
//     scoring average" — so we deliberately never compute or store them.
//   • Snapshot rows are keyed only by (band, metric); the requesting user's
//     own numbers are computed from their own rounds at request time.
//
// COHORTS:
//   Users are grouped into 5-stroke handicap bands off the WHS index
//   ("plus", "0-5", "5-10", ..., "30+"). A user's index comes from their
//   linked official handicap when present, else the app-calculated WHS index.
//   Users with no index land only in the "all" cohort. When a band has fewer
//   than MIN_BAND_SAMPLE users for a metric, the endpoint falls back to "all"
//   so small cohorts can't be reverse-engineered (n=2 percentiles would
//   effectively reveal the other player's numbers).
//
// FRESHNESS:
//   Snapshots are rebuilt lazily on read when older than SNAPSHOT_TTL_MS
//   (this repo avoids crons). The rebuild is a single full pass that writes
//   every band in one go, so the per-request cost is one indexed SELECT.
// ─────────────────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import {
  bandForHandicap,
  computeRoundStrokesGained,
  HandicapBand,
} from "./strokesGained";
import {
  MetricHoleInput,
  roundScoreToPar,
  summarisePutting,
  summariseApproach,
  summariseTeeShots,
} from "./roundMetrics";
import {
  calculateDifferentials,
  calculateHandicapIndex,
} from "./handicap";

// ── Metric registry ──────────────────────────────────────────────────────────

export const BENCHMARK_METRICS = [
  "scoreToPar",
  "avgPutts",
  "girRate",
  "fairwayRate",
  "sgOffTheTee",
  "sgApproach",
  "sgAroundGreen",
  "sgPutting",
] as const;
export type BenchmarkMetric = (typeof BENCHMARK_METRICS)[number];

export interface BenchmarkMetricConfig {
  label: string;
  /** true when a SMALLER value is better (scoreToPar, putts). */
  lowerIsBetter: boolean;
  /** Decimal places at the response boundary. */
  decimals: number;
}

export const BENCHMARK_METRIC_CONFIG: Record<
  BenchmarkMetric,
  BenchmarkMetricConfig
> = {
  scoreToPar: { label: "Score to Par", lowerIsBetter: true, decimals: 1 },
  avgPutts: { label: "Putts per Hole", lowerIsBetter: true, decimals: 2 },
  girRate: { label: "Greens in Regulation", lowerIsBetter: false, decimals: 2 },
  fairwayRate: { label: "Fairways Hit", lowerIsBetter: false, decimals: 2 },
  sgOffTheTee: { label: "SG: Off the Tee", lowerIsBetter: false, decimals: 2 },
  sgApproach: { label: "SG: Approach", lowerIsBetter: false, decimals: 2 },
  sgAroundGreen: { label: "SG: Around Green", lowerIsBetter: false, decimals: 2 },
  sgPutting: { label: "SG: Putting", lowerIsBetter: false, decimals: 2 },
};

// ── Tunables ─────────────────────────────────────────────────────────────────

/** Band cohorts below this many users fall back to the "all" cohort. */
export const MIN_BAND_SAMPLE = 20;
/**
 * Even the "all" cohort needs a few users before a percentile is meaningful
 * (and before it stops being trivially reversible). Below this we return the
 * user's value but a null percentile/median.
 */
export const MIN_ABSOLUTE_SAMPLE = 5;
/** Snapshots older than this are rebuilt on the next read. */
export const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;
/** Per-user metric values average over at most this many recent rounds. */
export const BENCHMARK_ROUND_WINDOW = 20;
/** The cohort key that contains every user with at least one scored round. */
export const ALL_BAND = "all";

// ── Handicap bands (5-stroke WHS buckets) ────────────────────────────────────

export const HANDICAP_BAND_KEYS = [
  "plus",
  "0-5",
  "5-10",
  "10-15",
  "15-20",
  "20-25",
  "25-30",
  "30+",
] as const;
export type HandicapBandKey = (typeof HANDICAP_BAND_KEYS)[number];

/**
 * 5-stroke bucket for a WHS index. Buckets are half-open [lo, lo+5): a 10.0
 * index is "10-15", not "5-10". Plus handicaps (index < 0) get their own
 * bucket, 30.0+ collapses into "30+" (WHS caps at 54 but the tail is sparse).
 * null (no index yet) → null: the user belongs only to the "all" cohort.
 */
export function bandKeyForIndex(
  handicapIndex: number | null,
): HandicapBandKey | null {
  if (handicapIndex == null || !Number.isFinite(handicapIndex)) return null;
  if (handicapIndex < 0) return "plus";
  if (handicapIndex >= 30) return "30+";
  const lo = Math.floor(handicapIndex / 5) * 5;
  return `${lo}-${lo + 5}` as HandicapBandKey;
}

/** Human-readable cohort label for UI captions. */
export function bandLabel(band: string): string {
  if (band === ALL_BAND) return "all players";
  if (band === "plus") return "plus handicaps";
  if (band === "30+") return "30+ handicaps";
  return `${band} handicaps`;
}

// ── Per-user metric values ───────────────────────────────────────────────────

export interface BenchmarkRoundInput {
  holes: MetricHoleInput[];
}

/**
 * One user's value for every benchmark metric: the mean of their per-round
 * values across the supplied (recent, scored) rounds. Rounds that didn't
 * track a metric contribute nothing to it; a metric no round tracked is null
 * (the user is then simply absent from that metric's cohort distribution).
 *
 * `sgBand` is the strokes-gained baseline band (low/mid/high) — distinct from
 * the 5-stroke benchmark cohort band.
 */
export function userMetricValues(
  rounds: BenchmarkRoundInput[],
  sgBand: HandicapBand,
): Record<BenchmarkMetric, number | null> {
  const sums: Record<BenchmarkMetric, { sum: number; n: number }> =
    Object.fromEntries(
      BENCHMARK_METRICS.map((m) => [m, { sum: 0, n: 0 }]),
    ) as Record<BenchmarkMetric, { sum: number; n: number }>;

  const add = (metric: BenchmarkMetric, value: number | null) => {
    if (value == null) return;
    sums[metric].sum += value;
    sums[metric].n += 1;
  };

  for (const r of rounds) {
    if (r.holes.length === 0) continue;
    add("scoreToPar", roundScoreToPar(r.holes));
    add("avgPutts", summarisePutting(r.holes).avgPutts);
    add("girRate", summariseApproach(r.holes).girRate);
    add("fairwayRate", summariseTeeShots(r.holes).fairwayRate);

    const sg = computeRoundStrokesGained(
      r.holes.map((h) => ({ ...h, sandShots: h.sandShots ?? null })),
      sgBand,
    );
    add("sgOffTheTee", sg.offTheTee.value);
    add("sgApproach", sg.approach.value);
    add("sgAroundGreen", sg.aroundGreen.value);
    add("sgPutting", sg.putting.value);
  }

  return Object.fromEntries(
    BENCHMARK_METRICS.map((m) => [
      m,
      sums[m].n > 0 ? sums[m].sum / sums[m].n : null,
    ]),
  ) as Record<BenchmarkMetric, number | null>;
}

// ── Percentile maths (pure — unit tested) ────────────────────────────────────

/** The percentile breakpoints stored in a snapshot: p5, p10, …, p95. */
export const PERCENTILE_STEPS = Array.from(
  { length: 19 },
  (_, i) => (i + 1) * 5,
);

export interface SnapshotSummary {
  /** breakpoint percentile (as string key "5".."95") → metric value. */
  percentiles: Record<string, number>;
}

/**
 * Linear-interpolated quantile of a SORTED ascending array. p in [0, 1].
 * Same method as numpy's default ("linear"): index = p × (n − 1).
 */
export function quantile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) {
    throw new Error("quantile: empty input");
  }
  if (p < 0 || p > 1) throw new Error("quantile: p must be in [0, 1]");
  const idx = p * (sortedValues.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedValues[lo];
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * (idx - lo);
}

/**
 * Build the aggregate summary stored in a BenchmarkSnapshot row. This is the
 * ONLY shape that ever leaves the cohort computation — raw per-user values
 * are discarded immediately after. Returns null for an empty cohort.
 */
export function buildSnapshotSummary(values: number[]): SnapshotSummary | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const percentiles: Record<string, number> = {};
  for (const step of PERCENTILE_STEPS) {
    // Round to 4dp: more than enough resolution for any golf metric, and it
    // blunts exact-value matching against an individual's known stats.
    percentiles[String(step)] =
      Math.round(quantile(sorted, step / 100) * 10000) / 10000;
  }
  return { percentiles };
}

/**
 * Where a value sits in a snapshot's distribution, as a RAW percentile
 * ("p% of the cohort is at or below this value"), linearly interpolated
 * between the stored breakpoints and clamped to [5, 95] — by design we never
 * claim anything sharper than "top/bottom 5%" (see privacy note up top).
 */
export function rawPercentileOfValue(
  summary: SnapshotSummary,
  value: number,
): number {
  const steps = PERCENTILE_STEPS;
  const bp = (s: number) => summary.percentiles[String(s)];

  if (value <= bp(steps[0])) return steps[0];
  if (value >= bp(steps[steps.length - 1])) return steps[steps.length - 1];

  for (let i = 0; i < steps.length - 1; i++) {
    const loV = bp(steps[i]);
    const hiV = bp(steps[i + 1]);
    if (value >= loV && value <= hiV) {
      if (hiV === loV) {
        // Flat run (many identical cohort values): report the midpoint of the
        // flat region rather than dividing by zero.
        let j = i + 1;
        while (j < steps.length - 1 && bp(steps[j + 1]) === loV) j++;
        return (steps[i] + steps[j]) / 2;
      }
      return steps[i] + ((value - loV) / (hiV - loV)) * (steps[i + 1] - steps[i]);
    }
  }
  // Unreachable when breakpoints are nondecreasing; defensive default.
  return 50;
}

/**
 * The user-facing percentile: "you're ahead of P% of the cohort". For
 * lower-is-better metrics (score, putts) a LOW raw percentile is good, so we
 * invert. Output is always in [5, 95] and higher always means better.
 */
export function betterThanPercentile(
  summary: SnapshotSummary,
  value: number,
  lowerIsBetter: boolean,
): number {
  const raw = rawPercentileOfValue(summary, value);
  const pct = lowerIsBetter ? 100 - raw : raw;
  return Math.round(pct);
}

// ── Cohort selection (small-sample fallback — unit tested) ──────────────────

export interface CohortSnapshot {
  band: string;
  summary: SnapshotSummary;
  sampleSize: number;
}

export interface ChosenCohort {
  snapshot: CohortSnapshot;
  /** Whether the band cohort was used or we fell back to all users. */
  cohort: "band" | "all";
}

/**
 * Pick the cohort to benchmark against: the user's handicap band when it has
 * at least MIN_BAND_SAMPLE users, otherwise everyone. Returns null when even
 * the "all" cohort is missing or below MIN_ABSOLUTE_SAMPLE — at that point a
 * percentile is both statistically meaningless and a privacy risk.
 */
export function chooseCohort(
  bandSnapshot: CohortSnapshot | null,
  allSnapshot: CohortSnapshot | null,
  minBandSample: number = MIN_BAND_SAMPLE,
  minAbsoluteSample: number = MIN_ABSOLUTE_SAMPLE,
): ChosenCohort | null {
  if (bandSnapshot && bandSnapshot.sampleSize >= minBandSample) {
    return { snapshot: bandSnapshot, cohort: "band" };
  }
  if (allSnapshot && allSnapshot.sampleSize >= minAbsoluteSample) {
    return { snapshot: allSnapshot, cohort: "all" };
  }
  return null;
}

// ── Snapshot refresh (DB; lazy, TTL-based — no cron) ─────────────────────────

/**
 * True when the canonical snapshot row exists and is younger than the TTL.
 * The ("all", scoreToPar) row is the freshness marker because every rebuild
 * always writes it.
 */
export async function snapshotsAreFresh(
  prisma: PrismaClient,
  ttlMs: number = SNAPSHOT_TTL_MS,
): Promise<boolean> {
  const marker = await prisma.benchmarkSnapshot.findUnique({
    where: { band_metric: { band: ALL_BAND, metric: "scoreToPar" } },
    select: { computedAt: true },
  });
  return marker != null && Date.now() - marker.computedAt.getTime() < ttlMs;
}

/**
 * Full rebuild: one pass over every user's recent rounds, then one upsert per
 * (band, metric). This is the expensive path — it runs at most once per TTL,
 * triggered by whichever request finds the marker stale.
 *
 * NOTE: deliberately not locked. If two requests race past a stale marker
 * they both rebuild and the second upsert wins with identical data — wasted
 * work, not corruption. At a scale where that matters, take a pg advisory
 * lock here.
 */
export async function rebuildBenchmarkSnapshots(
  prisma: PrismaClient,
): Promise<void> {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      linkedHandicap: { select: { handicapIndex: true } },
      rounds: {
        orderBy: { playedAt: "desc" },
        take: BENCHMARK_ROUND_WINDOW,
        select: {
          id: true,
          playedAt: true,
          course: {
            select: {
              name: true,
              courseRating: true,
              slopeRating: true,
              _count: { select: { holes: true } },
            },
          },
          roundHoles: {
            select: {
              strokes: true,
              putts: true,
              teeShotDirection: true,
              approachResult: true,
              sandShots: true,
              hole: { select: { par: true } },
            },
          },
        },
      },
    },
  });

  // Accumulate ONLY anonymous values; user ids never leave this loop.
  const cohorts = new Map<string, Map<BenchmarkMetric, number[]>>();
  const push = (band: string, metric: BenchmarkMetric, value: number) => {
    let byMetric = cohorts.get(band);
    if (!byMetric) {
      byMetric = new Map();
      cohorts.set(band, byMetric);
    }
    const arr = byMetric.get(metric) ?? [];
    arr.push(value);
    byMetric.set(metric, arr);
  };

  for (const user of users) {
    const scored = user.rounds.filter((r) => r.roundHoles.length > 0);
    if (scored.length === 0) continue;

    const handicapIndex =
      user.linkedHandicap?.handicapIndex ??
      calculateHandicapIndex(calculateDifferentials(user.rounds))
        ?.handicapIndex ??
      null;
    const sgBand = bandForHandicap(handicapIndex);
    const bandKey = bandKeyForIndex(handicapIndex);

    const values = userMetricValues(
      scored.map((r) => ({
        holes: r.roundHoles.map((rh) => ({
          par: rh.hole.par,
          strokes: rh.strokes,
          putts: rh.putts,
          teeShotDirection: rh.teeShotDirection,
          approachResult: rh.approachResult,
          sandShots: rh.sandShots,
        })),
      })),
      sgBand,
    );

    for (const metric of BENCHMARK_METRICS) {
      const v = values[metric];
      if (v == null) continue;
      push(ALL_BAND, metric, v);
      if (bandKey) push(bandKey, metric, v);
    }
  }

  const now = new Date();
  const upserts = [];
  for (const [band, byMetric] of cohorts) {
    for (const [metric, values] of byMetric) {
      const summary = buildSnapshotSummary(values);
      if (!summary) continue;
      upserts.push(
        prisma.benchmarkSnapshot.upsert({
          where: { band_metric: { band, metric } },
          create: {
            band,
            metric,
            summary: summary as object,
            sampleSize: values.length,
            computedAt: now,
          },
          update: {
            summary: summary as object,
            sampleSize: values.length,
            computedAt: now,
          },
        }),
      );
    }
  }
  // Bands whose last user disappeared would otherwise serve stale data forever.
  await prisma.$transaction([
    prisma.benchmarkSnapshot.deleteMany({ where: { computedAt: { lt: now } } }),
    ...upserts,
  ]);
}

/** Rebuild iff stale; called from the endpoint, never from a cron. */
export async function ensureFreshSnapshots(prisma: PrismaClient): Promise<void> {
  if (!(await snapshotsAreFresh(prisma))) {
    await rebuildBenchmarkSnapshots(prisma);
  }
}
