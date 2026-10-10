#!/usr/bin/env node
/**
 * Seed a LOCAL development database with a small, realistic friend group:
 * four golfers, two courses, ~30 completed rounds with full shot stats, a
 * pending friend request, reactions, comments, a competition and a tee time.
 *
 *   DATABASE_URL=postgresql://…@127.0.0.1:5433/fairplay_dev node scripts/seed-dev.mjs
 *
 * Every seeded account signs in with the password in DEV_PASSWORD below.
 *
 * It wipes the database first, so it refuses to run against anything that is
 * not on localhost — the real DATABASE_URL in .env points at Supabase.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const DEV_PASSWORD = "fairplay-dev-1";

const url = process.env.DATABASE_URL ?? "";
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(url)) {
  console.error("Refusing to seed: DATABASE_URL is not a localhost database.");
  process.exit(1);
}

const prisma = new PrismaClient();

// Deterministic PRNG so every seed produces the same data.
let s = 42;
const rand = () => ((s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const COURSES = [
  {
    name: "Royal Harbour Golf Club — Championship",
    courseRating: 72.4, slopeRating: 131,
    pars: [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5],
    dist: [385, 410, 165, 520, 360, 402, 188, 375, 540, 395, 172, 418, 505, 352, 390, 155, 425, 530],
  },
  {
    name: "Pine Valley Links — Blue",
    courseRating: 69.8, slopeRating: 124,
    pars: [4, 5, 3, 4, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 3, 4, 4, 5],
    dist: [340, 495, 150, 365, 330, 140, 380, 510, 355, 345, 372, 160, 488, 338, 170, 362, 390, 500],
  },
];

const USERS = [
  { name: "Alex Morgan", email: "alex@fairplay.test", skill: 14 },
  { name: "Sam Chen", email: "sam@fairplay.test", skill: 6 },
  { name: "Jordan Lee", email: "jordan@fairplay.test", skill: 22 },
  { name: "Taylor Brooks", email: "taylor@fairplay.test", skill: 10 },
];

function holeScore(par, skill) {
  // Average over par ≈ skill/18, with some spread.
  const r = rand();
  const expected = skill / 18;
  let over = Math.round(expected + (r - 0.5) * 2.2);
  if (rand() < 0.04) over -= 1; // the odd birdie
  return Math.max(par - 2, Math.min(par + 4, par + over));
}

async function main() {
  const tables = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);
  const users = [];
  for (const u of USERS) {
    users.push(
      await prisma.user.create({
        data: {
          name: u.name, email: u.email, passwordHash,
          emailVerified: true, hasCompletedOnboarding: true,
          createdAt: new Date(Date.now() - 200 * 864e5),
        },
      }),
    );
  }

  const courses = [];
  for (const c of COURSES) {
    courses.push(
      await prisma.course.create({
        data: {
          name: c.name, courseRating: c.courseRating, slopeRating: c.slopeRating,
          holes: {
            create: c.pars.map((par, i) => ({
              number: i + 1, par, distance: c.dist[i], strokeIndex: ((i * 7) % 18) + 1,
            })),
          },
        },
        include: { holes: { orderBy: { number: "asc" } } },
      }),
    );
  }

  const roundsByUser = new Map();
  for (const [ui, user] of users.entries()) {
    const n = ui === 0 ? 14 : 6;
    const rounds = [];
    for (let k = 0; k < n; k++) {
      const course = courses[k % 3 === 2 ? 1 : 0];
      // Spread over ~150 days, oldest first; Alex slowly improves.
      const daysAgo = Math.round(((n - k) / n) * 150) + Math.floor(rand() * 3);
      const skill = USERS[ui].skill + (ui === 0 ? (n - k) * 0.4 : 0);
      const playedAt = new Date(Date.now() - daysAgo * 864e5);
      playedAt.setHours(8 + Math.floor(rand() * 6), 0, 0, 0);
      const round = await prisma.round.create({
        data: {
          userId: user.id, courseId: course.id, playedAt,
          completedAt: new Date(playedAt.getTime() + 4.2 * 36e5),
          lastScoredAt: new Date(playedAt.getTime() + 4.2 * 36e5),
          shareId: crypto.randomBytes(5).toString("hex"),
          startNotificationSent: true,
        },
      });
      await prisma.roundHole.createMany({
        data: course.holes.map((h) => {
          const strokes = holeScore(h.par, skill);
          // On a GIR the putts are whatever is left after reaching the green in
          // regulation; otherwise one or two, with the occasional three-putt.
          const gir = strokes - h.par <= 1 && rand() < 0.55;
          const putts = gir
            ? Math.max(1, Math.min(3, strokes - (h.par - 2)))
            : Math.max(0, Math.min(strokes - 1, pick([1, 1, 2, 2, 2, 3])));
          return {
            roundId: round.id, holeId: h.id, strokes, putts,
            teeShotDirection: h.par === 3 ? null : pick(["fairway", "fairway", "left", "right"]),
            approachResult: gir ? "gir" : pick(["short", "long", "left", "right"]),
            penalties: rand() < 0.08 ? 1 : 0,
            sandShots: rand() < 0.12 ? 1 : 0,
          };
        }),
      });
      rounds.push(round);
    }
    roundsByUser.set(user.id, rounds);
  }

  const [alex, sam, jordan, taylor] = users;
  await prisma.friendship.createMany({
    data: [
      { requesterId: alex.id, addresseeId: sam.id, status: "ACCEPTED" },
      { requesterId: jordan.id, addresseeId: alex.id, status: "ACCEPTED" },
      { requesterId: sam.id, addresseeId: jordan.id, status: "ACCEPTED" },
      { requesterId: taylor.id, addresseeId: alex.id, status: "PENDING" },
    ],
  });

  const samLatest = roundsByUser.get(sam.id).at(-1);
  const alexLatest = roundsByUser.get(alex.id).at(-1);
  await prisma.roundReaction.createMany({
    data: [
      { roundId: samLatest.id, userId: alex.id, emoji: "🔥" },
      { roundId: alexLatest.id, userId: sam.id, emoji: "👏" },
      { roundId: alexLatest.id, userId: jordan.id, emoji: "🔥" },
    ],
  });
  await prisma.roundComment.createMany({
    data: [
      { roundId: alexLatest.id, userId: sam.id, text: "Great back nine! Rematch next week?" },
      { roundId: alexLatest.id, userId: alex.id, text: "You're on 😤" },
      { roundId: samLatest.id, userId: jordan.id, text: "How are you this consistent" },
    ],
  });

  const comp = await prisma.competition.create({
    data: {
      name: "Autumn Medal", creatorId: alex.id, courseId: courses[0].id,
      startDate: new Date(Date.now() - 30 * 864e5), endDate: new Date(Date.now() + 30 * 864e5),
      scoringType: "STABLEFORD",
    },
  });
  await prisma.competitionParticipant.createMany({
    data: [
      { competitionId: comp.id, userId: alex.id, status: "ACCEPTED" },
      { competitionId: comp.id, userId: sam.id, status: "ACCEPTED" },
      { competitionId: comp.id, userId: jordan.id, status: "INVITED" },
    ],
  });

  const tee = await prisma.teeTime.create({
    data: {
      creatorId: sam.id, courseId: courses[1].id,
      dateTime: new Date(Date.now() + 3 * 864e5 + 2 * 36e5), spotsTotal: 4,
      notes: "Early one — coffee at the clubhouse first",
    },
  });
  await prisma.teeTimeParticipant.createMany({
    data: [
      { teeTimeId: tee.id, userId: sam.id, status: "CONFIRMED" },
      { teeTimeId: tee.id, userId: alex.id, status: "INVITED" },
    ],
  });

  console.log(`Seeded ${users.length} users (password: ${DEV_PASSWORD}), ${courses.length} courses.`);
  console.log(users.map((u) => `  ${u.email}`).join("\n"));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
