import { describe, it, expect } from "vitest";
import {
  bandForHandicap,
  computeRoundStrokesGained,
  BASELINES,
  BandBaseline,
  HandicapBand,
  SGHoleInput,
} from "../lib/strokesGained";

// ─────────────────────────────────────────────────────────────────────────────
// Pure unit tests — no DB, no HTTP. Two layers:
//
//  1. Formula tests against an INJECTED baseline with deliberately clean
//     numbers, so every expectation is trivial mental arithmetic. These pin
//     the model's formulas and survive any retuning of BASELINES.
//
//  2. Hand-checked fixtures against the DEFAULT mid-band BASELINES values
//     (expectedPutts 2.0, fairwayRate 0.45, fairwayValue 0.3, penaltyCost 1.0,
//     girRate 0.30, girValue 0.9, scrambleRate 0.25, scrambleValue 0.6,
//     extraSandShotCost 0.5, expectedScore par4 = 4.7). Each expected value
//     is derived by hand in the comment next to it. If BASELINES is retuned,
//     update these literals.
// ─────────────────────────────────────────────────────────────────────────────

// Clean injected baseline: every formula result is an obvious fraction.
const CLEAN: BandBaseline = {
  expectedScoreByPar: { 3: 3, 4: 4, 5: 5 },
  expectedPutts: 2,
  fairwayRate: 0.5,
  girRate: 0.5,
  scrambleRate: 0.5,
  fairwayValue: 0.2,
  penaltyCost: 1,
  girValue: 1,
  scrambleValue: 1,
  extraSandShotCost: 1,
};
const CLEAN_BASELINES: Record<HandicapBand, BandBaseline> = {
  low: CLEAN,
  mid: CLEAN,
  high: CLEAN,
};

const hole = (overrides: Partial<SGHoleInput> & { par: number; strokes: number }): SGHoleInput =>
  overrides;

describe("bandForHandicap", () => {
  it("maps handicap index to bands with boundaries at 8 and 18", () => {
    expect(bandForHandicap(0)).toBe("low");
    expect(bandForHandicap(7.9)).toBe("low");
    expect(bandForHandicap(8)).toBe("mid"); // boundary: 8 is mid
    expect(bandForHandicap(18)).toBe("mid"); // boundary: 18 is still mid
    expect(bandForHandicap(18.1)).toBe("high");
    expect(bandForHandicap(36)).toBe("high");
  });

  it("defaults to mid when no handicap is known", () => {
    expect(bandForHandicap(null)).toBe("mid");
  });
});

describe("computeRoundStrokesGained — formulas (injected clean baseline)", () => {
  it("putting: SG = expectedPutts − putts", () => {
    // 1 putt → +1, 3 putts → −1, sums to 0 over the two holes.
    const sg = computeRoundStrokesGained(
      [
        hole({ par: 4, strokes: 4, putts: 1 }),
        hole({ par: 4, strokes: 4, putts: 3 }),
      ],
      "mid",
      CLEAN_BASELINES,
    );
    expect(sg.putting.value).toBe(0);
    expect(sg.putting.trackedHoles).toBe(2);
  });

  it("treats putts = 0 and putts = null as untracked (UI default is 0)", () => {
    const sg = computeRoundStrokesGained(
      [
        hole({ par: 4, strokes: 4, putts: 0 }),
        hole({ par: 4, strokes: 4, putts: null }),
        hole({ par: 4, strokes: 4 }),
      ],
      "mid",
      CLEAN_BASELINES,
    );
    expect(sg.putting.value).toBeNull();
    expect(sg.putting.trackedHoles).toBe(0);
  });

  it("off the tee: fairway +(1−rate)·value, miss −rate·value, penalty adds penaltyCost", () => {
    // fairwayRate 0.5, fairwayValue 0.2:
    //   fairway → +0.5 × 0.2 = +0.1
    //   left    → −0.5 × 0.2 = −0.1
    //   penalty → −0.1 − 1.0 = −1.1
    const fairway = computeRoundStrokesGained(
      [hole({ par: 4, strokes: 4, teeShotDirection: "fairway" })],
      "mid",
      CLEAN_BASELINES,
    );
    expect(fairway.offTheTee.value).toBeCloseTo(0.1, 5);

    const left = computeRoundStrokesGained(
      [hole({ par: 4, strokes: 5, teeShotDirection: "left" })],
      "mid",
      CLEAN_BASELINES,
    );
    expect(left.offTheTee.value).toBeCloseTo(-0.1, 5);

    const penalty = computeRoundStrokesGained(
      [hole({ par: 4, strokes: 6, teeShotDirection: "penalty" })],
      "mid",
      CLEAN_BASELINES,
    );
    expect(penalty.offTheTee.value).toBeCloseTo(-1.1, 5);
  });

  it("a player at exactly the baseline fairway rate nets ~0 off the tee", () => {
    // fairwayRate 0.5 → one fairway (+0.1) + one miss (−0.1) = 0.
    const sg = computeRoundStrokesGained(
      [
        hole({ par: 4, strokes: 4, teeShotDirection: "fairway" }),
        hole({ par: 5, strokes: 5, teeShotDirection: "right" }),
      ],
      "mid",
      CLEAN_BASELINES,
    );
    expect(sg.offTheTee.value).toBe(0);
  });

  it("ignores par-3 tee shots for off the tee (they are approaches)", () => {
    const sg = computeRoundStrokesGained(
      [hole({ par: 3, strokes: 3, teeShotDirection: "fairway" })],
      "mid",
      CLEAN_BASELINES,
    );
    expect(sg.offTheTee.value).toBeNull();
    expect(sg.offTheTee.trackedHoles).toBe(0);
  });

  it("approach: gir +(1−girRate)·girValue, any miss −girRate·girValue", () => {
    // girRate 0.5, girValue 1: gir → +0.5, miss → −0.5 (direction irrelevant).
    const gir = computeRoundStrokesGained(
      [hole({ par: 4, strokes: 4, approachResult: "gir" })],
      "mid",
      CLEAN_BASELINES,
    );
    expect(gir.approach.value).toBeCloseTo(0.5, 5);

    for (const miss of ["short", "long", "left", "right"]) {
      const sg = computeRoundStrokesGained(
        [hole({ par: 4, strokes: 5, approachResult: miss })],
        "mid",
        CLEAN_BASELINES,
      );
      expect(sg.approach.value).toBeCloseTo(-0.5, 5);
    }
  });

  it("around green: only evaluated on KNOWN missed greens", () => {
    // gir → no around-green attempt; untracked approach → excluded (we can't
    // tell a missed green from an untracked one).
    const sg = computeRoundStrokesGained(
      [
        hole({ par: 4, strokes: 4, approachResult: "gir" }),
        hole({ par: 4, strokes: 6 }), // approach untracked
      ],
      "mid",
      CLEAN_BASELINES,
    );
    expect(sg.aroundGreen.value).toBeNull();
    expect(sg.aroundGreen.trackedHoles).toBe(0);
  });

  it("around green: scramble +(1−rate)·value, fail −rate·value, extra sand shots cost extra", () => {
    // scrambleRate 0.5, scrambleValue 1: scramble → +0.5, fail → −0.5.
    const scramble = computeRoundStrokesGained(
      [hole({ par: 4, strokes: 4, approachResult: "short" })], // par save
      "mid",
      CLEAN_BASELINES,
    );
    expect(scramble.aroundGreen.value).toBeCloseTo(0.5, 5);

    const fail = computeRoundStrokesGained(
      [hole({ par: 4, strokes: 5, approachResult: "short" })], // bogey
      "mid",
      CLEAN_BASELINES,
    );
    expect(fail.aroundGreen.value).toBeCloseTo(-0.5, 5);

    // 3 sand shots → 2 beyond the first → −2 extra (extraSandShotCost 1).
    // Failed scramble (−0.5) + sand (−2) = −2.5.
    const sand = computeRoundStrokesGained(
      [hole({ par: 4, strokes: 7, approachResult: "right", sandShots: 3 })],
      "mid",
      CLEAN_BASELINES,
    );
    expect(sand.aroundGreen.value).toBeCloseTo(-2.5, 5);

    // One sand shot is a normal bunker escape — no extra cost.
    const oneSand = computeRoundStrokesGained(
      [hole({ par: 4, strokes: 5, approachResult: "right", sandShots: 1 })],
      "mid",
      CLEAN_BASELINES,
    );
    expect(oneSand.aroundGreen.value).toBeCloseTo(-0.5, 5);
  });

  it("totalVsBaseline = Σ expectedScore(par) − strokes, always computable", () => {
    // Clean baseline expects par exactly: birdie 3 on par 4 → +1; double 5 on
    // par 3 → −2; net −1. No tracked detail needed.
    const sg = computeRoundStrokesGained(
      [hole({ par: 4, strokes: 3 }), hole({ par: 3, strokes: 5 })],
      "mid",
      CLEAN_BASELINES,
    );
    expect(sg.totalVsBaseline).toBe(-1);
    expect(sg.holesPlayed).toBe(2);
  });

  it("falls back to par + par-4 overage for non-standard pars", () => {
    // Clean baseline par-4 overage = 0 → par 6 expected 6. Strokes 7 → −1.
    const sg = computeRoundStrokesGained(
      [hole({ par: 6, strokes: 7 })],
      "mid",
      CLEAN_BASELINES,
    );
    expect(sg.totalVsBaseline).toBe(-1);
  });

  it("returns null values and zero tracked holes for an empty round", () => {
    const sg = computeRoundStrokesGained([], "mid", CLEAN_BASELINES);
    expect(sg.offTheTee.value).toBeNull();
    expect(sg.approach.value).toBeNull();
    expect(sg.aroundGreen.value).toBeNull();
    expect(sg.putting.value).toBeNull();
    expect(sg.totalVsBaseline).toBe(0);
    expect(sg.holesPlayed).toBe(0);
  });
});

describe("computeRoundStrokesGained — hand-checked fixtures (default mid band)", () => {
  // Mid-band defaults used below:
  //   expectedPutts 2.0 | fairwayRate 0.45, fairwayValue 0.3, penaltyCost 1.0
  //   girRate 0.30, girValue 0.9 | scrambleRate 0.25, scrambleValue 0.6
  //   extraSandShotCost 0.5 | expected score on par 4 = 4.7
  it("textbook par: fairway, GIR, two putts", () => {
    const sg = computeRoundStrokesGained(
      [
        hole({
          par: 4,
          strokes: 4,
          putts: 2,
          teeShotDirection: "fairway",
          approachResult: "gir",
        }),
      ],
      "mid",
      BASELINES,
    );
    // putting: 2.0 − 2 = 0
    expect(sg.putting.value).toBe(0);
    // off the tee: (1 − 0.45) × 0.3 = 0.165 → stored rounded to 2 dp = 0.17
    expect(sg.offTheTee.value).toBe(0.17);
    // approach: (1 − 0.30) × 0.9 = 0.63
    expect(sg.approach.value).toBeCloseTo(0.63, 5);
    // around green: GIR → no scramble attempt
    expect(sg.aroundGreen.value).toBeNull();
    // total: 4.7 − 4 = +0.7 (a mid-handicapper gains 0.7 by making par)
    expect(sg.totalVsBaseline).toBeCloseTo(0.7, 5);
  });

  it("blow-up hole: penalty drive, missed green, no scramble, three putts", () => {
    const sg = computeRoundStrokesGained(
      [
        hole({
          par: 4,
          strokes: 7,
          putts: 3,
          teeShotDirection: "penalty",
          approachResult: "short",
        }),
      ],
      "mid",
      BASELINES,
    );
    // putting: 2.0 − 3 = −1
    expect(sg.putting.value).toBe(-1);
    // off the tee: −0.45 × 0.3 − 1.0 = −1.135 → stored rounded to 2 dp = −1.13
    expect(sg.offTheTee.value).toBe(-1.13);
    // approach: −0.30 × 0.9 = −0.27
    expect(sg.approach.value).toBeCloseTo(-0.27, 5);
    // around green: 7 > 4 → failed scramble: −0.25 × 0.6 = −0.15
    expect(sg.aroundGreen.value).toBeCloseTo(-0.15, 5);
    // total: 4.7 − 7 = −2.3
    expect(sg.totalVsBaseline).toBeCloseTo(-2.3, 5);
  });

  it("gritty par save: missed fairway and green, up-and-down with one putt", () => {
    const sg = computeRoundStrokesGained(
      [
        hole({
          par: 4,
          strokes: 4,
          putts: 1,
          teeShotDirection: "left",
          approachResult: "right",
          sandShots: 0,
        }),
      ],
      "mid",
      BASELINES,
    );
    // putting: 2.0 − 1 = +1
    expect(sg.putting.value).toBe(1);
    // off the tee: −0.45 × 0.3 = −0.135 → stored rounded to 2 dp = −0.13
    expect(sg.offTheTee.value).toBe(-0.13);
    // approach: −0.30 × 0.9 = −0.27
    expect(sg.approach.value).toBeCloseTo(-0.27, 5);
    // around green: scrambled (4 ≤ 4): (1 − 0.25) × 0.6 = +0.45
    expect(sg.aroundGreen.value).toBeCloseTo(0.45, 5);
    // total: 4.7 − 4 = +0.7
    expect(sg.totalVsBaseline).toBeCloseTo(0.7, 5);
  });

  it("aggregates per category across a multi-hole round", () => {
    const sg = computeRoundStrokesGained(
      [
        // Par 3, GIR, 2 putts: approach +0.63, putting 0. No OTT (par 3).
        hole({ par: 3, strokes: 3, putts: 2, approachResult: "gir" }),
        // Par 5, fairway, missed green, bogey, 2 putts:
        //   ott +0.165, approach −0.27, aroundGreen −0.15, putting 0.
        hole({
          par: 5,
          strokes: 6,
          putts: 2,
          teeShotDirection: "fairway",
          approachResult: "long",
        }),
        // Par 4, strokes only — contributes to nothing but total.
        hole({ par: 4, strokes: 5 }),
      ],
      "mid",
      BASELINES,
    );
    expect(sg.offTheTee.trackedHoles).toBe(1);
    expect(sg.offTheTee.value).toBe(0.17); // 0.165 rounded to 2 dp
    expect(sg.approach.trackedHoles).toBe(2);
    expect(sg.approach.value).toBeCloseTo(0.63 - 0.27, 2);
    expect(sg.aroundGreen.trackedHoles).toBe(1);
    expect(sg.aroundGreen.value).toBeCloseTo(-0.15, 5);
    expect(sg.putting.trackedHoles).toBe(2);
    expect(sg.putting.value).toBe(0);
    // total: (3.7−3) + (5.75−6) + (4.7−5) = 0.7 − 0.25 − 0.3 = +0.15
    expect(sg.totalVsBaseline).toBeCloseTo(0.15, 5);
  });

  it("bands disagree about the same round (sanity check on table wiring)", () => {
    const holes = [hole({ par: 4, strokes: 5, putts: 2 })];
    // Bogey on a par 4: low band expects 4.3 → −0.7; high expects 5.3 → +0.3.
    expect(computeRoundStrokesGained(holes, "low").totalVsBaseline).toBeCloseTo(-0.7, 5);
    expect(computeRoundStrokesGained(holes, "high").totalVsBaseline).toBeCloseTo(0.3, 5);
  });
});
