// WHS lookup table: [minRounds, maxRounds, differentialsToUse, adjustment]
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
    roundHoles: Array<{ strokes: number }>;
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
      return {
        roundId: r.id,
        playedAt: r.playedAt,
        courseName: r.course.name,
        gross,
        courseRating: r.course.courseRating!,
        slopeRating: r.course.slopeRating!,
        differential: parseFloat(diff.toFixed(1)),
      };
    });
}

/**
 * Calculate handicap index from an array of differentials.
 * Returns null if fewer than 3 differentials are provided.
 * Uses the most recent 20 differentials if more are provided.
 */
export function calculateHandicapIndex(
  differentials: RoundDifferential[]
): HandicapCalculation | null {
  // WHS uses at most the last 20
  const recent = differentials.slice(-20);
  const n = recent.length;

  if (n < 3) return null;

  const entry = WHS_TABLE.find(([min, max]) => n >= min && n <= max);
  if (!entry) return null;

  const [, , use, adj] = entry;

  const sorted = [...recent].sort((a, b) => a.differential - b.differential);
  const used = sorted.slice(0, use);
  const avg = used.reduce((s, d) => s + d.differential, 0) / use;

  const raw = (avg + adj) * 0.96;
  const handicapIndex = Math.trunc(raw * 10) / 10;
  const cappedIndex = Math.min(handicapIndex, 54.0);

  const usedIds = new Set(used.map((d) => d.roundId));

  return {
    handicapIndex: cappedIndex,
    differentialsUsed: use,
    totalEligible: n,
    differentials: recent.map((d) => ({ ...d, used: usedIds.has(d.roundId) })),
  };
}
