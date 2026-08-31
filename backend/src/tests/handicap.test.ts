import { describe, it, expect } from "vitest";
import {
  calculateDifferentials,
  calculateHandicapIndex,
  type RoundDifferential,
} from "../lib/handicap";

/**
 * The Handicap Index calculation had three defects that all pushed in
 * different directions and hid each other, so every case below that names a
 * specific number is checked against the Rules of Handicapping rather than
 * against what the code used to produce.
 */

let nextId = 1;

/** A differential with only the fields the Index calculation reads. */
function diff(value: number, daysAgo = 0): RoundDifferential {
  const playedAt = new Date("2026-08-31T00:00:00Z");
  playedAt.setDate(playedAt.getDate() - daysAgo);
  return {
    roundId: nextId++,
    playedAt,
    courseName: "Test Links",
    gross: 90,
    scoreToPar: 18,
    courseRating: 72,
    slopeRating: 113,
    differential: value,
  };
}

/** Newest first, which is the order every caller queries in. */
function series(values: number[]): RoundDifferential[] {
  return values.map((v, i) => diff(v, i));
}

describe("calculateHandicapIndex", () => {
  it("returns null below three scores — WHS issues no Index under 54 holes", () => {
    expect(calculateHandicapIndex([])).toBeNull();
    expect(calculateHandicapIndex(series([10.0]))).toBeNull();
    expect(calculateHandicapIndex(series([10.0, 11.0]))).toBeNull();
  });

  it("3 scores: lowest 1, adjusted -2.0", () => {
    expect(calculateHandicapIndex(series([14.2, 11.5, 18.0]))!.handicapIndex).toBe(9.5);
  });

  it("4 scores: lowest 1, adjusted -1.0", () => {
    expect(calculateHandicapIndex(series([14.2, 11.5, 18.0, 16.1]))!.handicapIndex).toBe(10.5);
  });

  it("5 scores: lowest 1, no adjustment", () => {
    expect(
      calculateHandicapIndex(series([14.2, 11.5, 18.0, 16.1, 20.3]))!.handicapIndex
    ).toBe(11.5);
  });

  it("6 scores: average of the lowest 2, adjusted -1.0", () => {
    // lowest two are 11.5 and 12.5 -> 12.0, minus 1.0
    const r = calculateHandicapIndex(series([14.2, 11.5, 18.0, 16.1, 20.3, 12.5]))!;
    expect(r.handicapIndex).toBe(11.0);
    expect(r.differentialsUsed).toBe(2);
  });

  it("20 scores: average of the lowest 8, no adjustment", () => {
    // 1.0 .. 20.0; lowest eight average to 4.5
    const values = Array.from({ length: 20 }, (_, i) => i + 1);
    const r = calculateHandicapIndex(series(values))!;
    expect(r.handicapIndex).toBe(4.5);
    expect(r.differentialsUsed).toBe(8);
    expect(r.totalEligible).toBe(20);
  });

  /**
   * The reported bug. Four scores whose lowest differential is -3.9 must give
   * -4.9: the lowest 1, minus the 1.0 the table applies at four scores.
   *
   * The code returned -4.7, because it multiplied by 0.96 — the pre-2020 USGA
   * "bonus for excellence", which WHS does not have.
   */
  it("does not apply the retired 0.96 bonus for excellence", () => {
    const r = calculateHandicapIndex(series([-0.5, -3.9, 4.0, 2.1]))!;
    expect(r.handicapIndex).toBe(-4.9);
    expect(r.handicapIndex).not.toBe(-4.7);
  });

  it("scales linearly — a mid-handicap Index is not shaved by 4%", () => {
    // Five scores, lowest 20.0, no adjustment. The 0.96 turned this into 19.2.
    expect(
      calculateHandicapIndex(series([20.0, 24.0, 26.0, 22.5, 28.1]))!.handicapIndex
    ).toBe(20.0);
  });

  it("rounds to one decimal rather than truncating toward zero", () => {
    // Six scores: lowest two are 13.9 and 13.8 -> 13.85, minus 1.0 = 12.85.
    // Truncation gave 12.8; WHS rounds to 12.9.
    const r = calculateHandicapIndex(series([13.9, 13.8, 20.0, 21.0, 22.0, 23.0]))!;
    expect(r.handicapIndex).toBe(12.9);
  });

  it("never reports a negative zero", () => {
    // Lowest 1 of five is 0.04 -> rounds to 0.0, not -0.0.
    const r = calculateHandicapIndex(series([0.04, 9.0, 9.0, 9.0, 9.0]))!;
    expect(Object.is(r.handicapIndex, -0)).toBe(false);
    expect(r.handicapIndex).toBe(0);
  });

  it("uses the 20 most recent scores, not the 20 oldest", () => {
    // 20 recent scores of 30.0, then 5 much older scores of 1.0. The old
    // `slice(-20)` took the tail of a newest-first array — the old ones — and
    // would have produced an Index built from the 1.0s.
    const recent = Array.from({ length: 20 }, (_, i) => diff(30.0, i));
    const ancient = Array.from({ length: 5 }, (_, i) => diff(1.0, 100 + i));
    const r = calculateHandicapIndex([...recent, ...ancient])!;
    expect(r.totalEligible).toBe(20);
    expect(r.handicapIndex).toBe(30.0);
    expect(r.differentials.every((d) => d.differential === 30.0)).toBe(true);
  });

  it("caps at the WHS maximum of 54.0 but has no floor", () => {
    expect(calculateHandicapIndex(series([60.0, 61.0, 62.0, 63.0, 64.0]))!.handicapIndex).toBe(54.0);
    // A plus handicap is legitimate and must not be clamped at zero.
    expect(calculateHandicapIndex(series([-6.0, -5.0, -4.0, -3.0, -2.0]))!.handicapIndex).toBe(-6.0);
  });

  it("flags exactly the differentials that fed the Index", () => {
    const r = calculateHandicapIndex(series([14.2, 11.5, 18.0, 16.1, 20.3, 12.5]))!;
    const used = r.differentials.filter((d) => d.used).map((d) => d.differential).sort();
    expect(used).toEqual([11.5, 12.5]);
  });

  it("returns differentials newest first, the order the Stats table renders", () => {
    const r = calculateHandicapIndex(series([14.2, 11.5, 18.0, 16.1]))!;
    const dates = r.differentials.map((d) => d.playedAt.getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });
});

// ── Score differentials ──────────────────────────────────────────────────────

function round(
  id: number,
  strokes: number[],
  opts: { courseRating?: number | null; slopeRating?: number | null; holes?: number; pars?: number[] } = {}
) {
  const { courseRating = 72.0, slopeRating = 113, holes = strokes.length, pars } = opts;
  return {
    id,
    playedAt: new Date("2026-08-31T00:00:00Z"),
    course: { name: "Test Links", courseRating, slopeRating, _count: { holes } },
    roundHoles: strokes.map((s, i) => ({
      strokes: s,
      ...(pars ? { hole: { par: pars[i] } } : {}),
    })),
  };
}

describe("calculateDifferentials", () => {
  it("applies (113 / slope) x (gross - course rating), to one decimal", () => {
    // The reported round: 68 at 72.4 / 128 -> 0.8828 * -4.4 = -3.884 -> -3.9
    const [d] = calculateDifferentials([
      round(1, Array(18).fill(0).map((_, i) => (i === 0 ? 68 - 17 : 1)), {
        courseRating: 72.4,
        slopeRating: 128,
      }),
    ]);
    expect(d.gross).toBe(68);
    expect(d.differential).toBe(-3.9);
  });

  it("skips rounds on a course with no rating or slope", () => {
    expect(calculateDifferentials([round(1, Array(18).fill(5), { courseRating: null })])).toHaveLength(0);
    expect(calculateDifferentials([round(2, Array(18).fill(5), { slopeRating: null })])).toHaveLength(0);
  });

  it("skips rounds that are not fully scored", () => {
    expect(calculateDifferentials([round(1, Array(17).fill(5), { holes: 18 })])).toHaveLength(0);
    expect(calculateDifferentials([round(2, Array(18).fill(5), { holes: 18 })])).toHaveLength(1);
  });

  it("computes scoreToPar only when every hole carries a par", () => {
    const withPar = calculateDifferentials([
      round(1, Array(18).fill(5), { pars: Array(18).fill(4) }),
    ]);
    expect(withPar[0].scoreToPar).toBe(18);

    const withoutPar = calculateDifferentials([round(2, Array(18).fill(5))]);
    expect(withoutPar[0].scoreToPar).toBeNull();
  });
});
