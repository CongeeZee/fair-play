// Unit tests for lib/roundMetrics — pure functions, no DB required.
// Fixtures are hand-checked: the expected numbers in each assertion are
// derived in the comments so a failure pinpoints a logic change.
import { describe, it, expect } from "vitest";
import {
  rollingAverage,
  computeTrendDelta,
  roundMetricValue,
  roundScoreToPar,
  holeBreakdown,
  summarisePutting,
  summariseApproach,
  summariseTeeShots,
  TREND_METRIC_CONFIG,
  MetricHoleInput,
} from "../lib/roundMetrics";

// Convenience hole builder — untracked everything unless overridden.
const hole = (over: Partial<MetricHoleInput> = {}): MetricHoleInput => ({
  par: 4,
  strokes: 5,
  putts: null,
  teeShotDirection: null,
  approachResult: null,
  ...over,
});

describe("rollingAverage", () => {
  it("is null until the window is full, then a trailing mean", () => {
    // window 3 over [2, 4, 6, 8, 10]:
    //   i=0,1 → null (window not full)
    //   i=2 → (2+4+6)/3 = 4
    //   i=3 → (4+6+8)/3 = 6
    //   i=4 → (6+8+10)/3 = 8
    expect(rollingAverage([2, 4, 6, 8, 10], 3)).toEqual([null, null, 4, 6, 8]);
  });

  it("window 1 returns the values themselves", () => {
    expect(rollingAverage([3, 1, 7], 1)).toEqual([3, 1, 7]);
  });

  it("returns all nulls when there are fewer values than the window", () => {
    expect(rollingAverage([1, 2], 5)).toEqual([null, null]);
  });

  it("handles an empty input", () => {
    expect(rollingAverage([], 3)).toEqual([]);
  });

  it("handles negative values (scoreToPar can be under par)", () => {
    // window 2 over [-2, 4]: i=1 → (-2+4)/2 = 1
    expect(rollingAverage([-2, 4], 2)).toEqual([null, 1]);
  });

  it("rejects a window below 1", () => {
    expect(() => rollingAverage([1], 0)).toThrow();
  });
});

describe("computeTrendDelta", () => {
  // A throwaway config making arithmetic obvious: lower-is-better,
  // anything within ±0.5 is stable.
  const lowerBetter = { higherIsBetter: false, stableThreshold: 0.5, decimals: 2 };
  const higherBetter = { higherIsBetter: true, stableThreshold: 0.5, decimals: 2 };

  it("returns null with fewer than 2×window values", () => {
    expect(computeTrendDelta([1, 2, 3], 2, lowerBetter)).toBeNull(); // need 4
    expect(computeTrendDelta([], 5, lowerBetter)).toBeNull();
  });

  it("compares last N vs previous N (lower-is-better improving)", () => {
    // values (oldest→newest): [10, 12, 8, 6], window 2
    //   previous = [10, 12] → avg 11; last = [8, 6] → avg 7
    //   delta = 7 - 11 = -4; lower is better → improving
    const d = computeTrendDelta([10, 12, 8, 6], 2, lowerBetter)!;
    expect(d.previousAvg).toBe(11);
    expect(d.lastAvg).toBe(7);
    expect(d.value).toBe(-4);
    expect(d.magnitude).toBe(4);
    expect(d.direction).toBe("improving");
    expect(d.window).toBe(2);
  });

  it("same numbers read as declining when higher is better", () => {
    const d = computeTrendDelta([10, 12, 8, 6], 2, higherBetter)!;
    expect(d.value).toBe(-4);
    expect(d.direction).toBe("declining");
  });

  it("|delta| at or under the threshold is stable", () => {
    // previous [4, 4] avg 4; last [4, 4.6] avg 4.3 → delta 0.3 ≤ 0.5 → stable
    const d = computeTrendDelta([4, 4, 4, 4.6], 2, lowerBetter)!;
    expect(d.value).toBeCloseTo(0.3, 10);
    expect(d.direction).toBe("stable");
  });

  it("uses only the most recent 2×window values", () => {
    // window 2 over [100, 1, 2, 3, 4]: the 100 is older than 2×window and
    // must be ignored. previous [1, 2] avg 1.5; last [3, 4] avg 3.5 → +2.
    const d = computeTrendDelta([100, 1, 2, 3, 4], 2, higherBetter)!;
    expect(d.previousAvg).toBe(1.5);
    expect(d.lastAvg).toBe(3.5);
    expect(d.value).toBe(2);
    expect(d.direction).toBe("improving");
  });

  it("exact-boundary count (length === 2×window) works", () => {
    const d = computeTrendDelta([1, 2], 1, higherBetter)!;
    expect(d.value).toBe(1); // last [2] vs previous [1]
    expect(d.direction).toBe("improving");
  });
});

describe("shared summaries", () => {
  it("roundScoreToPar sums strokes minus par; null for no holes", () => {
    // (5-4) + (3-3) + (7-5) = 1 + 0 + 2 = 3
    expect(
      roundScoreToPar([
        hole({ par: 4, strokes: 5 }),
        hole({ par: 3, strokes: 3 }),
        hole({ par: 5, strokes: 7 }),
      ]),
    ).toBe(3);
    expect(roundScoreToPar([])).toBeNull();
  });

  it("holeBreakdown buckets by score vs par", () => {
    const result = holeBreakdown([
      hole({ par: 5, strokes: 3 }), // -2 → eagle
      hole({ par: 4, strokes: 3 }), // -1 → birdie
      hole({ par: 4, strokes: 4 }), //  0 → par
      hole({ par: 4, strokes: 5 }), // +1 → bogey
      hole({ par: 4, strokes: 7 }), // +3 → double+
    ]);
    expect(result).toEqual({ eagles: 1, birdies: 1, pars: 1, bogeys: 1, doublesOrWorse: 1 });
  });

  it("summarisePutting ignores null AND zero putts (untracked)", () => {
    // tracked: 2, 3 → avg 2.5; one 3-putt of two tracked → rate 0.5
    const p = summarisePutting([
      hole({ putts: 2 }),
      hole({ putts: 3 }),
      hole({ putts: 0 }), // untracked by convention
      hole({ putts: null }),
    ]);
    expect(p.tracked).toBe(2);
    expect(p.avgPutts).toBe(2.5);
    expect(p.threePuttRate).toBe(0.5);
  });

  it("summariseApproach computes GIR rate and miss breakdown", () => {
    const a = summariseApproach([
      hole({ approachResult: "gir" }),
      hole({ approachResult: "left" }),
      hole({ approachResult: "short" }),
      hole({ approachResult: null }), // untracked
    ]);
    expect(a.tracked).toBe(3);
    expect(a.girRate).toBeCloseTo(1 / 3, 10);
    expect(a.misses).toEqual({ left: 1, right: 0, short: 1, long: 0, total: 2 });
  });

  it("summariseTeeShots only counts par 4/5 with a tracked direction", () => {
    const t = summariseTeeShots([
      hole({ par: 4, teeShotDirection: "fairway" }),
      hole({ par: 5, teeShotDirection: "left" }),
      hole({ par: 3, teeShotDirection: "fairway" }), // par 3 — excluded
      hole({ par: 4, teeShotDirection: null }), // untracked — excluded
    ]);
    expect(t.tracked).toBe(2);
    expect(t.fairwayRate).toBe(0.5);
  });
});

describe("roundMetricValue", () => {
  it("returns null for an empty round, for every metric", () => {
    for (const metric of Object.keys(TREND_METRIC_CONFIG) as Array<
      keyof typeof TREND_METRIC_CONFIG
    >) {
      expect(roundMetricValue(metric, [], "mid")).toBeNull();
    }
  });

  it("putts metric is per-hole average, null when untracked", () => {
    expect(
      roundMetricValue("putts", [hole({ putts: 2 }), hole({ putts: 1 })], "mid"),
    ).toBe(1.5);
    expect(roundMetricValue("putts", [hole(), hole()], "mid")).toBeNull();
  });

  it("girRate / fairwayRate are null when nothing is tracked", () => {
    expect(roundMetricValue("girRate", [hole()], "mid")).toBeNull();
    expect(roundMetricValue("fairwayRate", [hole()], "mid")).toBeNull();
  });

  it("strokesGained equals totalVsBaseline (expected score − strokes)", () => {
    // mid band expectedScoreByPar: par 4 → 4.7. One par 4 in 4 strokes:
    // totalVsBaseline = 4.7 − 4 = 0.7 (rounded to 2dp inside the SG lib).
    expect(
      roundMetricValue("strokesGained", [hole({ par: 4, strokes: 4 })], "mid"),
    ).toBe(0.7);
  });
});
