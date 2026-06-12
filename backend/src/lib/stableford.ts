// ── Stableford scoring ───────────────────────────────────────────────────────
//
// Stableford awards points per hole based on the player's NET score relative
// to par (net = gross strokes minus handicap strokes received on that hole):
//
//   net double bogey or worse  → 0 pts
//   net bogey                  → 1 pt
//   net par                    → 2 pts
//   net birdie                 → 3 pts
//   net eagle                  → 4 pts   (and so on, +1 per stroke better)
//
// Handicap strokes are allocated per hole using the course's stroke index
// (1 = hardest hole gets the first stroke). Most imported courses don't have
// official stroke indexes, so when any hole is missing one we fall back to a
// deterministic proxy: longer holes are treated as harder (distance descending,
// hole number ascending as tiebreak). This keeps allocation stable for a given
// course and is documented user-facing as "estimated stroke index".

export interface StablefordHoleInput {
  number: number;
  par: number;
  distance: number;
  strokeIndex?: number | null;
}

/**
 * Allocate handicap strokes received per hole.
 *
 * - Positive courseHandicap: one stroke per hole for each full multiple of the
 *   hole count, remainder allocated to the hardest holes first.
 * - Negative courseHandicap (plus handicap): strokes are given BACK starting
 *   from the easiest holes (received = -1 on those holes).
 * - Works for 9- or 18-hole layouts: allocation is over the holes provided.
 *
 * Returns a map keyed by hole number → strokes received (can be negative).
 */
export function allocateStrokesReceived(
  holes: StablefordHoleInput[],
  courseHandicap: number,
): Map<number, number> {
  const received = new Map<number, number>();
  for (const h of holes) received.set(h.number, 0);
  const n = holes.length;
  if (n === 0 || courseHandicap === 0) return received;

  // Order holes hardest-first. Use official stroke index only when every hole
  // has a distinct one; a partial/duplicated set is unreliable.
  const indexes = holes.map((h) => h.strokeIndex);
  const hasFullIndex =
    indexes.every((si) => si != null) &&
    new Set(indexes).size === n;

  const hardestFirst = [...holes].sort((a, b) => {
    if (hasFullIndex) return a.strokeIndex! - b.strokeIndex!;
    return b.distance - a.distance || a.number - b.number;
  });

  if (courseHandicap > 0) {
    for (let i = 0; i < courseHandicap; i++) {
      const hole = hardestFirst[i % n];
      received.set(hole.number, received.get(hole.number)! + 1);
    }
  } else {
    // Plus handicap: give strokes back on the easiest holes first.
    const easiestFirst = [...hardestFirst].reverse();
    for (let i = 0; i < -courseHandicap; i++) {
      const hole = easiestFirst[i % n];
      received.set(hole.number, received.get(hole.number)! - 1);
    }
  }
  return received;
}

/** Points for a single hole. Never negative. */
export function stablefordPointsForHole(
  par: number,
  strokes: number,
  strokesReceived: number,
): number {
  const netToPar = strokes - strokesReceived - par;
  return Math.max(0, 2 - netToPar);
}

export interface StablefordResult {
  totalPoints: number;
  /** hole number → points */
  pointsByHole: Map<number, number>;
  /** hole number → strokes received */
  strokesReceived: Map<number, number>;
}

/**
 * Calculate Stableford points for a set of scored holes.
 * `courseHandicap` of 0 yields gross Stableford (points vs raw par).
 */
export function calculateStableford(
  holes: Array<StablefordHoleInput & { strokes: number }>,
  courseHandicap: number,
): StablefordResult {
  const strokesReceived = allocateStrokesReceived(holes, courseHandicap);
  const pointsByHole = new Map<number, number>();
  let totalPoints = 0;
  for (const h of holes) {
    const pts = stablefordPointsForHole(h.par, h.strokes, strokesReceived.get(h.number) ?? 0);
    pointsByHole.set(h.number, pts);
    totalPoints += pts;
  }
  return { totalPoints, pointsByHole, strokesReceived };
}

/** WHS course handicap from index + slope, rounded to nearest integer. */
export function courseHandicapFrom(
  handicapIndex: number | null,
  slopeRating: number | null,
): number {
  if (handicapIndex == null) return 0;
  return Math.round((handicapIndex * (slopeRating ?? 113)) / 113);
}
