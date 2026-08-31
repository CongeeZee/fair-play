/**
 * WHS score-allocation table: [minScores, maxScores, differentialsToUse, adjustment]
 *
 * Straight from the Rules of Handicapping, Appendix A. The negative
 * adjustments on 3, 4 and 6 scores look like a mistake and are not: with very
 * few scores the lowest differential is a poor estimate of demonstrated
 * ability, and WHS deliberately biases the resulting Index downward until
 * enough scores exist to stand on their own. It is why a player with exactly
 * four scores gets an Index a full stroke below their best differential.
 */
const WHS_TABLE: [number, number, number, number][] = [
  [3, 3, 1, -2.0],
  [4, 4, 1, -1.0],
  [5, 5, 1, 0],
  [6, 6, 2, -1.0],
  [7, 8, 2, 0],
  [9, 11, 3, 0],
  [12, 14, 4, 0],
  [15, 16, 5, 0],
  [17, 18, 6, 0],
  [19, 19, 7, 0],
  [20, 20, 8, 0],
];

export interface RoundDifferential {
  roundId: number;
  playedAt: Date;
  courseName: string;
  gross: number;
  /**
   * Gross strokes relative to the par of the holes actually played. Null when
   * the caller did not select each hole's par — `getUserHandicapIndex` and the
   * benchmarks job only ever want the index out of this, so they are not made
   * to fetch a column they will throw away.
   */
  scoreToPar: number | null;
  courseRating: number;
  slopeRating: number;
  differential: number;
}

export interface HandicapCalculation {
  handicapIndex: number;
  differentialsUsed: number;
  totalEligible: number;
  differentials: (RoundDifferential & { used: boolean })[];
}

/**
 * Calculate score differentials from eligible rounds.
 * Each round must have: course.courseRating, course.slopeRating, and roundHoles with strokes.
 */
export function calculateDifferentials(
  rounds: Array<{
    id: number;
    playedAt: Date;
    course: {
      name: string;
      courseRating: number | null;
      slopeRating: number | null;
      _count: { holes: number };
    };
    roundHoles: Array<{ strokes: number; hole?: { par: number } }>;
  }>
): RoundDifferential[] {
  return rounds
    .filter((r) => {
      const totalHoles = r.course._count.holes;
      return (
        r.roundHoles.length === totalHoles &&
        totalHoles > 0 &&
        r.course.courseRating != null &&
        r.course.slopeRating != null
      );
    })
    .map((r) => {
      const gross = r.roundHoles.reduce((s, rh) => s + rh.strokes, 0);
      const diff = (113 / r.course.slopeRating!) * (gross - r.course.courseRating!);
      // Par is only summed when every hole carries one, so a partial select
      // cannot silently produce a to-par figure measured against fewer holes
      // than the gross it is subtracted from.
      const pars = r.roundHoles.map((rh) => rh.hole?.par);
      const hasPar = pars.every((p): p is number => typeof p === "number");
      return {
        roundId: r.id,
        playedAt: r.playedAt,
        courseName: r.course.name,
        gross,
        scoreToPar: hasPar ? gross - pars.reduce((a, b) => a + b, 0) : null,
        courseRating: r.course.courseRating!,
        slopeRating: r.course.slopeRating!,
        differential: parseFloat(diff.toFixed(1)),
      };
    });
}

/**
 * Calculate a Handicap Index from a set of score differentials.
 *
 * Returns null below three differentials — WHS will not issue an Index until a
 * player has submitted 54 holes.
 *
 * The Index is the average of the lowest N differentials among the player's 20
 * most recent scores, plus the table's adjustment, rounded to one decimal.
 * That is the whole calculation; there is no other coefficient in it.
 */
export function calculateHandicapIndex(
  differentials: RoundDifferential[]
): HandicapCalculation | null {
  /* Most *recent* 20, chosen here rather than trusted from the caller.
     This used to be `differentials.slice(-20)`, which takes the last 20
     elements of the array — and every caller passes them newest-first, so it
     was selecting the twenty OLDEST scores. It went unnoticed because every
     caller also caps its query at 20 rounds, making the slice a no-op; it
     would have silently frozen a player's Index on their opening season the
     moment they passed twenty scores. Sorting by date here means the function
     no longer depends on how a caller happened to order its query. */
  const recent = [...differentials]
    .sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime())
    .slice(0, 20);
  const n = recent.length;

  if (n < 3) return null;

  const entry = WHS_TABLE.find(([min, max]) => n >= min && n <= max);
  if (!entry) return null;

  const [, , use, adj] = entry;

  const sorted = [...recent].sort((a, b) => a.differential - b.differential);
  const used = sorted.slice(0, use);
  const avg = used.reduce((s, d) => s + d.differential, 0) / use;

  /* No 0.96 here, and that is the point.
     The 0.96 "bonus for excellence" belonged to the pre-2020 USGA system and
     did not survive into WHS — the Rules of Handicapping define the Index as
     the adjusted average of the lowest differentials, full stop. Carrying it
     over scaled every Index in the app by 4% toward zero: a 20.0 was reported
     as 19.2, and a plus-handicap's -4.9 was reported as -4.7. */
  const raw = avg + adj;

  /* Round, don't truncate. WHS rounds the Index to one decimal place;
     `Math.trunc` was biasing every result toward zero by up to 0.09 — a 12.36
     came out as 12.3 rather than 12.4. `+ 0` normalises the -0 that rounding a
     small negative produces, so a scratch player's Index prints as "0.0"
     rather than "-0.0". */
  const rounded = Math.round(raw * 10) / 10 + 0;

  // 54.0 is the maximum Index WHS will issue. There is no floor: a
  // better-than-scratch player legitimately carries a negative ("plus") Index.
  const cappedIndex = Math.min(rounded, 54.0);

  const usedIds = new Set(used.map((d) => d.roundId));

  return {
    handicapIndex: cappedIndex,
    differentialsUsed: use,
    totalEligible: n,
    // Newest first, which is the order the Stats table renders.
    differentials: recent.map((d) => ({ ...d, used: usedIds.has(d.roundId) })),
  };
}
