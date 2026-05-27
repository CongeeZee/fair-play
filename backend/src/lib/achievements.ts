import prisma from "./prisma";
import type { Achievement } from "@prisma/client";

export type AchievementCategory = "SCORING" | "MILESTONE" | "COURSE";

export interface EvalRound {
  id: number;
  playedAt: Date;
  completedAt: Date | null;
  courseId: number;
  course: { name: string; _count: { holes: number } };
  roundHoles: Array<{ strokes: number; hole: { par: number; number: number } }>;
}

interface CheckResult {
  unlocked: boolean;
  roundId?: number | null;
  metadata?: Record<string, unknown>;
}

export interface AchievementDef {
  type: string;
  name: string;
  description: string;
  emoji: string;
  category: AchievementCategory;
  check: (rounds: EvalRound[]) => CheckResult;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function totalStrokes(r: EvalRound): number {
  return r.roundHoles.reduce((s, rh) => s + rh.strokes, 0);
}

function totalPar(r: EvalRound): number {
  return r.roundHoles.reduce((s, rh) => s + rh.hole.par, 0);
}

function isFull18(r: EvalRound): boolean {
  return (
    r.completedAt !== null &&
    r.course._count.holes >= 18 &&
    r.roundHoles.length === r.course._count.holes
  );
}

function byPlayedAtAsc(a: EvalRound, b: EvalRound): number {
  return a.playedAt.getTime() - b.playedAt.getTime();
}

// Find the earliest round + hole satisfying a per-hole predicate
function firstHoleMatch(
  rounds: EvalRound[],
  predicate: (rh: EvalRound["roundHoles"][number]) => boolean
): { round: EvalRound; hole: EvalRound["roundHoles"][number] } | null {
  const completed = rounds.filter((r) => r.completedAt !== null).sort(byPlayedAtAsc);
  for (const r of completed) {
    const match = r.roundHoles.find(predicate);
    if (match) return { round: r, hole: match };
  }
  return null;
}

// Find earliest 18-hole completed round satisfying a predicate on (round, totalStrokes, scoreToPar)
function firstFullRoundMatch(
  rounds: EvalRound[],
  predicate: (r: EvalRound, strokes: number, scoreToPar: number) => boolean
): { round: EvalRound; strokes: number; scoreToPar: number } | null {
  const sorted = rounds.filter(isFull18).sort(byPlayedAtAsc);
  for (const r of sorted) {
    const s = totalStrokes(r);
    const stp = s - totalPar(r);
    if (predicate(r, s, stp)) return { round: r, strokes: s, scoreToPar: stp };
  }
  return null;
}

function countAtLeast(rounds: EvalRound[], n: number): boolean {
  return rounds.filter((r) => r.completedAt !== null).length >= n;
}

function distinctCoursesAtLeast(rounds: EvalRound[], n: number): boolean {
  const ids = new Set<number>();
  for (const r of rounds) {
    if (r.completedAt !== null) ids.add(r.courseId);
  }
  return ids.size >= n;
}

// ── Catalogue ────────────────────────────────────────────────────────────────

export const ACHIEVEMENTS: AchievementDef[] = [
  // Scoring
  {
    type: "FIRST_BIRDIE",
    name: "First Birdie",
    description: "Made your first birdie",
    emoji: "🐦",
    category: "SCORING",
    check: (rounds) => {
      const m = firstHoleMatch(rounds, (rh) => rh.strokes === rh.hole.par - 1);
      if (!m) return { unlocked: false };
      return {
        unlocked: true,
        roundId: m.round.id,
        metadata: { holeNumber: m.hole.hole.number, par: m.hole.hole.par, course: m.round.course.name },
      };
    },
  },
  {
    type: "FIRST_EAGLE",
    name: "Eagle Eye",
    description: "Made your first eagle",
    emoji: "🦅",
    category: "SCORING",
    check: (rounds) => {
      const m = firstHoleMatch(rounds, (rh) => rh.strokes === rh.hole.par - 2);
      if (!m) return { unlocked: false };
      return {
        unlocked: true,
        roundId: m.round.id,
        metadata: { holeNumber: m.hole.hole.number, par: m.hole.hole.par, course: m.round.course.name },
      };
    },
  },
  {
    type: "FIRST_PAR_ROUND",
    name: "Even Steven",
    description: "Finished a round at even par or better",
    emoji: "⚖️",
    category: "SCORING",
    check: (rounds) => {
      const m = firstFullRoundMatch(rounds, (_r, _s, stp) => stp <= 0);
      if (!m) return { unlocked: false };
      return {
        unlocked: true,
        roundId: m.round.id,
        metadata: { scoreToPar: m.scoreToPar, score: m.strokes, course: m.round.course.name },
      };
    },
  },
  {
    type: "BROKE_100",
    name: "Double Digits",
    description: "Broke 100 for the first time",
    emoji: "💯",
    category: "SCORING",
    check: (rounds) => {
      const m = firstFullRoundMatch(rounds, (_r, s) => s < 100);
      if (!m) return { unlocked: false };
      return { unlocked: true, roundId: m.round.id, metadata: { score: m.strokes, course: m.round.course.name } };
    },
  },
  {
    type: "BROKE_90",
    name: "Breaking Through",
    description: "Broke 90 for the first time",
    emoji: "🔥",
    category: "SCORING",
    check: (rounds) => {
      const m = firstFullRoundMatch(rounds, (_r, s) => s < 90);
      if (!m) return { unlocked: false };
      return { unlocked: true, roundId: m.round.id, metadata: { score: m.strokes, course: m.round.course.name } };
    },
  },
  {
    type: "BROKE_80",
    name: "Single Digits",
    description: "Broke 80 for the first time",
    emoji: "⭐",
    category: "SCORING",
    check: (rounds) => {
      const m = firstFullRoundMatch(rounds, (_r, s) => s < 80);
      if (!m) return { unlocked: false };
      return { unlocked: true, roundId: m.round.id, metadata: { score: m.strokes, course: m.round.course.name } };
    },
  },
  {
    type: "HOLE_IN_ONE",
    name: "Ace!",
    description: "Made a hole in one",
    emoji: "🏆",
    category: "SCORING",
    check: (rounds) => {
      const m = firstHoleMatch(rounds, (rh) => rh.hole.par === 3 && rh.strokes === 1);
      if (!m) return { unlocked: false };
      return {
        unlocked: true,
        roundId: m.round.id,
        metadata: { holeNumber: m.hole.hole.number, course: m.round.course.name },
      };
    },
  },

  // Milestones
  {
    type: "FIRST_ROUND",
    name: "Off the Tee",
    description: "Completed your first round",
    emoji: "⛳",
    category: "MILESTONE",
    check: (rounds) => {
      const completed = rounds.filter((r) => r.completedAt !== null).sort(byPlayedAtAsc);
      if (completed.length === 0) return { unlocked: false };
      const r = completed[0];
      return { unlocked: true, roundId: r.id, metadata: { course: r.course.name } };
    },
  },
  {
    type: "ROUNDS_10",
    name: "Getting Hooked",
    description: "Completed 10 rounds",
    emoji: "🔟",
    category: "MILESTONE",
    check: (rounds) => {
      const completed = rounds.filter((r) => r.completedAt !== null).sort(byPlayedAtAsc);
      if (completed.length < 10) return { unlocked: false };
      return { unlocked: true, roundId: completed[9].id };
    },
  },
  {
    type: "ROUNDS_25",
    name: "Quarter Century",
    description: "Completed 25 rounds",
    emoji: "🏅",
    category: "MILESTONE",
    check: (rounds) => {
      const completed = rounds.filter((r) => r.completedAt !== null).sort(byPlayedAtAsc);
      if (completed.length < 25) return { unlocked: false };
      return { unlocked: true, roundId: completed[24].id };
    },
  },
  {
    type: "ROUNDS_50",
    name: "Half Ton",
    description: "Completed 50 rounds",
    emoji: "🎯",
    category: "MILESTONE",
    check: (rounds) => {
      const completed = rounds.filter((r) => r.completedAt !== null).sort(byPlayedAtAsc);
      if (completed.length < 50) return { unlocked: false };
      return { unlocked: true, roundId: completed[49].id };
    },
  },
  {
    type: "ROUNDS_100",
    name: "Centurion",
    description: "Completed 100 rounds",
    emoji: "👑",
    category: "MILESTONE",
    check: (rounds) => {
      const completed = rounds.filter((r) => r.completedAt !== null).sort(byPlayedAtAsc);
      if (completed.length < 100) return { unlocked: false };
      return { unlocked: true, roundId: completed[99].id };
    },
  },

  // Course
  {
    type: "COURSES_5",
    name: "Explorer",
    description: "Played 5 different courses",
    emoji: "🗺️",
    category: "COURSE",
    check: (rounds) => (distinctCoursesAtLeast(rounds, 5) ? { unlocked: true } : { unlocked: false }),
  },
  {
    type: "COURSES_10",
    name: "Globetrotter",
    description: "Played 10 different courses",
    emoji: "🌏",
    category: "COURSE",
    check: (rounds) => (distinctCoursesAtLeast(rounds, 10) ? { unlocked: true } : { unlocked: false }),
  },
  {
    type: "COURSES_25",
    name: "Course Collector",
    description: "Played 25 different courses",
    emoji: "📍",
    category: "COURSE",
    check: (rounds) => (distinctCoursesAtLeast(rounds, 25) ? { unlocked: true } : { unlocked: false }),
  },

  // Personal best (re-unlockable)
  {
    type: "PERSONAL_BEST",
    name: "New PB!",
    description: "Set a new personal best score",
    emoji: "🎉",
    category: "SCORING",
    check: (rounds) => {
      const full = rounds.filter(isFull18).sort(byPlayedAtAsc);
      if (full.length < 2) return { unlocked: false };
      let min = totalStrokes(full[0]);
      let pbRound: EvalRound | null = null;
      let pbStrokes = min;
      for (let i = 1; i < full.length; i++) {
        const s = totalStrokes(full[i]);
        if (s < min) {
          pbRound = full[i];
          pbStrokes = s;
          min = s;
        }
      }
      if (!pbRound) return { unlocked: false };
      return {
        unlocked: true,
        roundId: pbRound.id,
        metadata: { score: pbStrokes, course: pbRound.course.name, playedAt: pbRound.playedAt.toISOString() },
      };
    },
  },
];

const ACHIEVEMENTS_BY_TYPE = new Map(ACHIEVEMENTS.map((a) => [a.type, a]));

export function getAchievementDef(type: string): AchievementDef | undefined {
  return ACHIEVEMENTS_BY_TYPE.get(type);
}

// ── Evaluation ───────────────────────────────────────────────────────────────

export async function evaluateAchievements(
  userId: number
): Promise<{ newlyUnlocked: Achievement[]; allAchievements: Achievement[] }> {
  const rounds = (await prisma.round.findMany({
    where: { userId, completedAt: { not: null } },
    select: {
      id: true,
      playedAt: true,
      completedAt: true,
      courseId: true,
      course: { select: { name: true, _count: { select: { holes: true } } } },
      roundHoles: {
        select: { strokes: true, hole: { select: { par: true, number: true } } },
      },
    },
    orderBy: { playedAt: "asc" },
  })) as EvalRound[];

  const existing = await prisma.achievement.findMany({ where: { userId } });
  const existingByType = new Map(existing.map((a) => [a.type, a]));
  const newlyUnlocked: Achievement[] = [];

  for (const def of ACHIEVEMENTS) {
    const result = def.check(rounds);
    if (!result.unlocked) continue;

    const prior = existingByType.get(def.type);

    if (def.type === "PERSONAL_BEST") {
      const newScore = (result.metadata as { score?: number } | undefined)?.score;
      const oldScore = (prior?.metadata as { score?: number } | null)?.score;
      if (!prior) {
        const created = await prisma.achievement.create({
          data: {
            userId,
            type: def.type,
            roundId: result.roundId ?? null,
            metadata: (result.metadata ?? null) as never,
          },
        });
        newlyUnlocked.push(created);
        existingByType.set(def.type, created);
      } else if (newScore != null && oldScore != null && newScore < oldScore) {
        const updated = await prisma.achievement.update({
          where: { id: prior.id },
          data: {
            roundId: result.roundId ?? null,
            metadata: (result.metadata ?? null) as never,
            unlockedAt: new Date(),
          },
        });
        newlyUnlocked.push(updated);
        existingByType.set(def.type, updated);
      }
    } else {
      if (prior) continue;
      const created = await prisma.achievement.create({
        data: {
          userId,
          type: def.type,
          roundId: result.roundId ?? null,
          metadata: (result.metadata ?? null) as never,
        },
      });
      newlyUnlocked.push(created);
      existingByType.set(def.type, created);
    }
  }

  const allAchievements = await prisma.achievement.findMany({ where: { userId } });
  return { newlyUnlocked, allAchievements };
}
