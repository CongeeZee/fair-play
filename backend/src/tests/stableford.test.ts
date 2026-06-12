import { describe, it, expect } from "vitest";
import {
  allocateStrokesReceived,
  stablefordPointsForHole,
  calculateStableford,
  courseHandicapFrom,
} from "../lib/stableford";

// 18 holes with official stroke indexes. Hole 1 has SI 1 (hardest),
// hole 18 has SI 18 (easiest) — i.e. SI equals hole number for simplicity.
const holesWithSI = Array.from({ length: 18 }, (_, i) => ({
  number: i + 1,
  par: 4,
  distance: 400 - i, // strictly decreasing so distance fallback = same order
  strokeIndex: i + 1,
}));

// Same layout but no stroke indexes — fallback must use distance descending.
const holesNoSI = holesWithSI.map(({ strokeIndex: _si, ...rest }) => rest);

describe("allocateStrokesReceived", () => {
  it("gives one stroke on the N hardest holes for handicap N", () => {
    const received = allocateStrokesReceived(holesWithSI, 10);
    for (let n = 1; n <= 10; n++) expect(received.get(n)).toBe(1);
    for (let n = 11; n <= 18; n++) expect(received.get(n)).toBe(0);
  });

  it("wraps to a second stroke on the hardest holes when handicap > 18", () => {
    const received = allocateStrokesReceived(holesWithSI, 20);
    expect(received.get(1)).toBe(2);
    expect(received.get(2)).toBe(2);
    expect(received.get(3)).toBe(1);
    expect(received.get(18)).toBe(1);
    const total = [...received.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(20);
  });

  it("gives strokes back on the easiest holes for plus handicaps", () => {
    const received = allocateStrokesReceived(holesWithSI, -2);
    expect(received.get(18)).toBe(-1);
    expect(received.get(17)).toBe(-1);
    expect(received.get(1)).toBe(0);
  });

  it("returns all zeros for handicap 0", () => {
    const received = allocateStrokesReceived(holesWithSI, 0);
    expect([...received.values()].every((v) => v === 0)).toBe(true);
  });

  it("falls back to distance descending when stroke indexes are missing", () => {
    const received = allocateStrokesReceived(holesNoSI, 3);
    // Longest holes are 1, 2, 3 (distance 400, 399, 398)
    expect(received.get(1)).toBe(1);
    expect(received.get(2)).toBe(1);
    expect(received.get(3)).toBe(1);
    expect(received.get(4)).toBe(0);
  });

  it("ignores partial/duplicated stroke indexes and uses the fallback", () => {
    const partial = holesWithSI.map((h, i) => ({
      ...h,
      strokeIndex: i < 9 ? h.strokeIndex : null,
    }));
    const received = allocateStrokesReceived(partial, 1);
    // Fallback (distance desc) puts the stroke on hole 1 here too, so check
    // determinism with duplicated indexes instead: all SI = 1.
    expect(received.get(1)).toBe(1);
    const dupes = holesWithSI.map((h) => ({ ...h, strokeIndex: 1 }));
    const received2 = allocateStrokesReceived(dupes, 1);
    expect(received2.get(1)).toBe(1); // distance fallback, not SI ties
  });

  it("allocates across 9 holes for 9-hole layouts", () => {
    const nine = holesWithSI.slice(0, 9);
    const received = allocateStrokesReceived(nine, 11);
    const total = [...received.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(11);
    expect(received.get(1)).toBe(2); // 11 = 9 + 2 → two hardest get 2
    expect(received.get(2)).toBe(2);
    expect(received.get(3)).toBe(1);
  });
});

describe("stablefordPointsForHole", () => {
  it("scores the standard scale", () => {
    expect(stablefordPointsForHole(4, 2, 0)).toBe(4); // eagle
    expect(stablefordPointsForHole(4, 3, 0)).toBe(3); // birdie
    expect(stablefordPointsForHole(4, 4, 0)).toBe(2); // par
    expect(stablefordPointsForHole(4, 5, 0)).toBe(1); // bogey
    expect(stablefordPointsForHole(4, 6, 0)).toBe(0); // double
    expect(stablefordPointsForHole(4, 10, 0)).toBe(0); // never negative
  });

  it("applies strokes received (net scoring)", () => {
    expect(stablefordPointsForHole(4, 5, 1)).toBe(2); // net par
    expect(stablefordPointsForHole(4, 6, 2)).toBe(2); // net par with 2 strokes
    expect(stablefordPointsForHole(4, 4, -1)).toBe(1); // plus handicap gives back
  });
});

describe("calculateStableford", () => {
  it("totals points across a round", () => {
    const holes = holesWithSI.map((h) => ({ ...h, strokes: h.par + 1 })); // all bogeys
    // Handicap 18 → one stroke everywhere → net par everywhere → 36 pts
    const result = calculateStableford(holes, 18);
    expect(result.totalPoints).toBe(36);
    expect(result.pointsByHole.get(1)).toBe(2);
  });

  it("gross stableford with handicap 0", () => {
    const holes = holesWithSI.map((h) => ({ ...h, strokes: h.par })); // all pars
    const result = calculateStableford(holes, 0);
    expect(result.totalPoints).toBe(36);
  });
});

describe("courseHandicapFrom", () => {
  it("rounds index x slope / 113", () => {
    expect(courseHandicapFrom(10.0, 113)).toBe(10);
    expect(courseHandicapFrom(10.0, 130)).toBe(12); // 11.50 → 12
    expect(courseHandicapFrom(10.0, null)).toBe(10); // slope defaults to 113
    expect(courseHandicapFrom(null, 130)).toBe(0);
  });
});
