import prisma from "./prisma";
import { calculateDifferentials, calculateHandicapIndex } from "./handicap";

/**
 * Resolve a user's current handicap index: a manually linked official
 * handicap wins, otherwise compute WHS from their last 20 completed rounds.
 * Returns null when neither is available.
 */
export async function getUserHandicapIndex(userId: number): Promise<number | null> {
  const linked = await prisma.linkedHandicap.findUnique({ where: { userId } });
  if (linked) return linked.handicapIndex;

  const rounds = await prisma.round.findMany({
    where: { userId, completedAt: { not: null } },
    include: {
      course: { select: { name: true, courseRating: true, slopeRating: true, _count: { select: { holes: true } } } },
      roundHoles: { select: { strokes: true } },
    },
    orderBy: { playedAt: "desc" },
    take: 20,
  });

  const diffs = calculateDifferentials(rounds);
  const calc = calculateHandicapIndex(diffs);
  return calc?.handicapIndex ?? null;
}
