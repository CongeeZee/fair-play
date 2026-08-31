import { Router, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { requireVerifiedEmail } from "../middleware/requireVerifiedEmail";
import { getUserHandicapIndex } from "../lib/userHandicap";
import { calculateStableford, courseHandicapFrom } from "../lib/stableford";
import { sendPushToUser } from "../lib/pushNotification";

const router = Router();

router.use(requireAuth);

router.use(requireVerifiedEmail("Verify your email to use competitions"));

// Helper: derive competition status from dates
function compStatus(startDate: Date, endDate: Date): "UPCOMING" | "ACTIVE" | "COMPLETED" {
  const now = new Date();
  if (now < startDate) return "UPCOMING";
  if (now > endDate) return "COMPLETED";
  return "ACTIVE";
}

// ── POST /competitions — create a competition ─────────────────────────────────

const createSchema = z.object({
  name: z.string().min(1).max(50),
  courseId: z.number().int().optional(),
  startDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  endDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  scoringType: z.enum(["NET", "GROSS", "STABLEFORD"]).default("NET"),
  inviteUserIds: z.array(z.number().int()).optional(),
});

router.post("/", async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  const { name, courseId, startDate: startStr, endDate: endStr, scoringType, inviteUserIds } = parsed.data;
  const startDate = new Date(startStr);
  const endDate = new Date(endStr);

  if (endDate <= startDate) {
    res.status(400).json({ error: "End date must be after start date" });
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (startDate < today) {
    res.status(400).json({ error: "Start date cannot be in the past" });
    return;
  }

  // Duplicates in the request would become duplicate participant rows, which
  // the composite unique on (competitionId, userId) rejects — and since the
  // participants are now created inside the competition insert, that failure
  // would take the whole creation down rather than being skipped.
  const inviteIds = [...new Set(inviteUserIds ?? [])].filter((id) => id !== req.userId!);

  try {
    /* These three reads have no dependency on each other, so they go out
       together. Run sequentially they were three serial round-trips before
       the insert had even started; against a managed database in another
       region that is the dominant cost of creating a competition. */
    const [course, friendships, creator] = await Promise.all([
      courseId
        ? prisma.course.findUnique({ where: { id: courseId }, select: { id: true } })
        : Promise.resolve(null),
      inviteIds.length > 0
        ? prisma.friendship.findMany({
            where: {
              status: "ACCEPTED",
              OR: [
                { requesterId: req.userId!, addresseeId: { in: inviteIds } },
                { addresseeId: req.userId!, requesterId: { in: inviteIds } },
              ],
            },
            select: { requesterId: true, addresseeId: true },
          })
        : Promise.resolve([]),
      inviteIds.length > 0
        ? prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } })
        : Promise.resolve(null),
    ]);

    if (courseId && !course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }

    // Only actual friends can be invited: an id the caller is not friends with
    // is dropped rather than rejected, so one stale id cannot fail the create.
    const friendIdSet = new Set(
      friendships.map((f) => (f.requesterId === req.userId! ? f.addresseeId : f.requesterId))
    );
    const validIds = inviteIds.filter((id) => friendIdSet.has(id));

    /* Creator and invitees are created in the same statement as the
       competition. Besides saving another round-trip, it makes the invite list
       atomic with the competition: the old second `createMany` could fail and
       leave a competition that had been reported as created with nobody
       invited to it. */
    const comp = await prisma.competition.create({
      data: {
        name,
        creatorId: req.userId!,
        courseId: courseId ?? null,
        startDate,
        endDate,
        scoringType,
        participants: {
          create: [
            { userId: req.userId!, status: "ACCEPTED" as const },
            ...validIds.map((userId) => ({ userId, status: "INVITED" as const })),
          ],
        },
      },
      include: {
        course: { select: { id: true, name: true } },
        participants: { select: { userId: true, status: true } },
      },
    });

    for (const userId of validIds) {
      sendPushToUser(userId, "Competition Invite", `${creator?.name} invited you to ${name}`, `/competitions/${comp.id}`).catch(() => {});
    }

    res.status(201).json({ ...comp, status: compStatus(comp.startDate, comp.endDate) });
  } catch (err) {
    console.error("POST /competitions error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /competitions/:id/invite ─────────────────────────────────────────────

const inviteSchema = z.object({
  userIds: z.array(z.number().int()).min(1),
});

router.post("/:id/invite", async (req: AuthRequest, res: Response) => {
  const compId = String(req.params.id);
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const comp = await prisma.competition.findUnique({
    where: { id: compId },
    include: { participants: { select: { userId: true } } },
  });

  if (!comp) { res.status(404).json({ error: "Competition not found" }); return; }
  if (comp.creatorId !== req.userId!) { res.status(403).json({ error: "Only the creator can invite" }); return; }

  const { userIds } = parsed.data;
  const existingIds = new Set(comp.participants.map((p) => p.userId));
  const newIds = userIds.filter((id) => !existingIds.has(id));

  // Verify all are accepted friends
  const friendships = await prisma.friendship.findMany({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: req.userId!, addresseeId: { in: newIds } },
        { addresseeId: req.userId!, requesterId: { in: newIds } },
      ],
    },
  });
  const friendIdSet = new Set(
    friendships.map((f) => (f.requesterId === req.userId! ? f.addresseeId : f.requesterId))
  );
  const validIds = newIds.filter((id) => friendIdSet.has(id));

  if (validIds.length === 0) {
    res.status(400).json({ error: "No valid friends to invite" });
    return;
  }

  await prisma.competitionParticipant.createMany({
    data: validIds.map((userId) => ({ competitionId: compId, userId, status: "INVITED" as const })),
    skipDuplicates: true,
  });

  const creator = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
  for (const userId of validIds) {
    sendPushToUser(userId, "Competition Invite", `${creator?.name} invited you to ${comp.name}`, `/competitions/${compId}`).catch(() => {});
  }

  res.json({ invited: validIds.length });
});

// ── POST /competitions/:id/respond ────────────────────────────────────────────

const respondSchema = z.object({
  response: z.enum(["ACCEPTED", "DECLINED"]),
});

router.post("/:id/respond", async (req: AuthRequest, res: Response) => {
  const compId = String(req.params.id);
  const parsed = respondSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid response" });
    return;
  }

  const participant = await prisma.competitionParticipant.findUnique({
    where: { competitionId_userId: { competitionId: compId, userId: req.userId! } },
  });

  if (!participant) { res.status(404).json({ error: "Invitation not found" }); return; }
  if (participant.status !== "INVITED") { res.status(400).json({ error: "Already responded" }); return; }

  await prisma.competitionParticipant.update({
    where: { id: participant.id },
    data: { status: parsed.data.response },
  });

  res.json({ status: parsed.data.response });
});

// ── POST /competitions/:id/submit-round ───────────────────────────────────────

const submitSchema = z.object({
  roundId: z.number().int(),
});

router.post("/:id/submit-round", async (req: AuthRequest, res: Response) => {
  const compId = String(req.params.id);
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const comp = await prisma.competition.findUnique({
    where: { id: compId },
    include: { course: { select: { id: true, slopeRating: true } } },
  });
  if (!comp) { res.status(404).json({ error: "Competition not found" }); return; }

  const status = compStatus(comp.startDate, comp.endDate);
  if (status !== "ACTIVE") {
    res.status(400).json({ error: "Competition is not currently active" });
    return;
  }

  const participant = await prisma.competitionParticipant.findUnique({
    where: { competitionId_userId: { competitionId: compId, userId: req.userId! } },
  });
  if (!participant || participant.status !== "ACCEPTED") {
    res.status(403).json({ error: "You must accept the invitation first" });
    return;
  }

  // Check if user already submitted
  const existing = await prisma.competitionRound.findFirst({
    where: { competitionId: compId, userId: req.userId! },
  });
  if (existing) {
    res.status(400).json({ error: "You already submitted a round to this competition" });
    return;
  }

  const round = await prisma.round.findUnique({
    where: { id: parsed.data.roundId },
    include: {
      course: { select: { id: true, slopeRating: true, courseRating: true, holes: { select: { par: true } } } },
      roundHoles: {
        select: {
          strokes: true,
          hole: { select: { par: true, number: true, distance: true, strokeIndex: true } },
        },
      },
    },
  });

  if (!round) { res.status(404).json({ error: "Round not found" }); return; }
  if (round.userId !== req.userId!) { res.status(403).json({ error: "Round does not belong to you" }); return; }
  if (!round.completedAt) { res.status(400).json({ error: "Round is not completed" }); return; }

  // Check date window
  const playedAt = new Date(round.playedAt);
  if (playedAt < comp.startDate || playedAt > comp.endDate) {
    res.status(400).json({ error: "Round was not played within the competition window" });
    return;
  }

  // Check course match
  if (comp.courseId && round.courseId !== comp.courseId) {
    res.status(400).json({ error: "Round was played at a different course" });
    return;
  }

  // Check not already submitted to this comp
  const dupCheck = await prisma.competitionRound.findUnique({
    where: { competitionId_roundId: { competitionId: compId, roundId: round.id } },
  });
  if (dupCheck) {
    res.status(400).json({ error: "This round is already submitted to this competition" });
    return;
  }

  // Calculate scores
  const grossScore = round.roundHoles.reduce((s, rh) => s + rh.strokes, 0);
  const totalPar = round.roundHoles.reduce((s, rh) => s + rh.hole.par, 0);
  const scoreToPar = grossScore - totalPar;

  let netScore: number | null = null;
  let netScoreToPar: number | null = null;
  let stablefordPoints: number | null = null;

  if (comp.scoringType === "NET") {
    const handicapIndex = await getUserHandicapIndex(req.userId!);
    if (handicapIndex != null) {
      const slope = round.course.slopeRating ?? 113;
      const courseHandicap = Math.round(handicapIndex * slope / 113);
      netScore = grossScore - courseHandicap;
      netScoreToPar = parseFloat((scoreToPar - courseHandicap).toFixed(1));
    } else {
      // No handicap — net equals gross
      netScore = grossScore;
      netScoreToPar = scoreToPar;
    }
  } else if (comp.scoringType === "STABLEFORD") {
    // Net Stableford: handicap strokes are allocated per hole by stroke index
    // (or the distance fallback). With no handicap available, courseHandicap
    // is 0 and this degrades gracefully to gross Stableford.
    const handicapIndex = await getUserHandicapIndex(req.userId!);
    const courseHandicap = courseHandicapFrom(handicapIndex, round.course.slopeRating);
    const result = calculateStableford(
      round.roundHoles.map((rh) => ({
        number: rh.hole.number,
        par: rh.hole.par,
        distance: rh.hole.distance,
        strokeIndex: rh.hole.strokeIndex,
        strokes: rh.strokes,
      })),
      courseHandicap,
    );
    stablefordPoints = result.totalPoints;
  }

  const compRound = await prisma.competitionRound.create({
    data: {
      competitionId: compId,
      roundId: round.id,
      userId: req.userId!,
      grossScore,
      netScore,
      scoreToPar,
      netScoreToPar,
      stablefordPoints,
    },
  });

  // Notify other participants
  const otherParticipants = await prisma.competitionParticipant.findMany({
    where: { competitionId: compId, status: "ACCEPTED", userId: { not: req.userId! } },
    select: { userId: true },
  });
  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
  const scoreStr =
    comp.scoringType === "STABLEFORD"
      ? `${stablefordPoints ?? 0} pts`
      : scoreToPar === 0 ? "even par" : scoreToPar > 0 ? `+${scoreToPar}` : `${scoreToPar}`;
  for (const p of otherParticipants) {
    sendPushToUser(p.userId, comp.name, `${user?.name} posted ${comp.scoringType === "STABLEFORD" ? scoreStr : `a ${scoreStr}`}`, `/competitions/${compId}`).catch(() => {});
  }

  res.status(201).json(compRound);
});

// ── GET /competitions — list user's competitions ──────────────────────────────

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const comps = await prisma.competition.findMany({
      where: {
        participants: {
          some: {
            userId: req.userId!,
            status: { in: ["ACCEPTED", "INVITED"] },
          },
        },
      },
      include: {
        course: { select: { id: true, name: true } },
        participants: { select: { userId: true, status: true } },
        rounds: { select: { userId: true } },
        creator: { select: { name: true } },
      },
      orderBy: { startDate: "desc" },
    });

    // Check for completed comps that haven't sent notifications
    for (const comp of comps) {
      if (!comp.notificationSent && compStatus(comp.startDate, comp.endDate) === "COMPLETED") {
        // Send end-of-comp notification
        prisma.competition.update({
          where: { id: comp.id },
          data: { notificationSent: true },
        }).then(() => {
          const accepted = comp.participants.filter((p) => p.status === "ACCEPTED");
          for (const p of accepted) {
            sendPushToUser(p.userId, "Competition Ended", `${comp.name} is over! Check the final results`, `/competitions/${comp.id}`).catch(() => {});
          }
        }).catch(() => {});
      }
    }

    const myParticipant = (comp: typeof comps[0]) =>
      comp.participants.find((p) => p.userId === req.userId!);

    const mapped = comps.map((comp) => ({
      id: comp.id,
      name: comp.name,
      creatorName: comp.creator.name,
      creatorId: comp.creatorId,
      course: comp.course,
      startDate: comp.startDate,
      endDate: comp.endDate,
      scoringType: comp.scoringType,
      status: compStatus(comp.startDate, comp.endDate),
      participantCount: comp.participants.filter((p) => p.status === "ACCEPTED").length,
      invitedCount: comp.participants.filter((p) => p.status === "INVITED").length,
      myStatus: myParticipant(comp)?.status ?? null,
      hasSubmitted: comp.rounds.some((r) => r.userId === req.userId!),
    }));

    const active = mapped.filter((c) => c.status === "ACTIVE");
    const upcoming = mapped.filter((c) => c.status === "UPCOMING");
    const completed = mapped.filter((c) => c.status === "COMPLETED");

    res.json({ active, upcoming, completed });
  } catch (err) {
    console.error("GET /competitions error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /competitions/:id — competition detail with leaderboard ───────────────

router.get("/:id", async (req: AuthRequest, res: Response) => {
  const compId = String(req.params.id);

  try {
    const comp = await prisma.competition.findUnique({
      where: { id: compId },
      include: {
        course: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
        participants: {
          include: { user: { select: { id: true, name: true } } },
        },
        rounds: {
          include: {
            user: { select: { id: true, name: true } },
            round: {
              select: {
                playedAt: true,
                course: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!comp) { res.status(404).json({ error: "Competition not found" }); return; }

    // Check user is a participant
    const myParticipant = comp.participants.find((p) => p.userId === req.userId!);
    if (!myParticipant) { res.status(403).json({ error: "Not a participant" }); return; }

    const status = compStatus(comp.startDate, comp.endDate);

    // Build leaderboard — Stableford ranks by points DESCENDING (more is
    // better); stroke formats rank by score-to-par ascending.
    const sortedRounds = [...comp.rounds].sort((a, b) => {
      if (comp.scoringType === "STABLEFORD") {
        return (b.stablefordPoints ?? 0) - (a.stablefordPoints ?? 0);
      }
      const aVal = comp.scoringType === "NET" ? (a.netScoreToPar ?? a.scoreToPar) : a.scoreToPar;
      const bVal = comp.scoringType === "NET" ? (b.netScoreToPar ?? b.scoreToPar) : b.scoreToPar;
      return aVal - bVal;
    });

    const leaderboard = sortedRounds.map((cr, idx) => ({
      rank: idx + 1,
      userId: cr.userId,
      name: cr.user.name,
      grossScore: cr.grossScore,
      netScore: cr.netScore,
      scoreToPar: cr.scoreToPar,
      netScoreToPar: cr.netScoreToPar,
      stablefordPoints: cr.stablefordPoints,
      courseName: cr.round.course.name,
      playedAt: cr.round.playedAt,
    }));

    // Participants who haven't submitted
    const submittedUserIds = new Set(comp.rounds.map((r) => r.userId));
    const noSubmission = comp.participants
      .filter((p) => p.status === "ACCEPTED" && !submittedUserIds.has(p.userId))
      .map((p) => ({ userId: p.userId, name: p.user.name }));

    const participants = comp.participants.map((p) => ({
      userId: p.userId,
      name: p.user.name,
      status: p.status,
    }));

    res.json({
      id: comp.id,
      name: comp.name,
      creator: comp.creator,
      course: comp.course,
      startDate: comp.startDate,
      endDate: comp.endDate,
      scoringType: comp.scoringType,
      status,
      participants,
      leaderboard,
      noSubmission,
      myStatus: myParticipant.status,
      hasSubmitted: submittedUserIds.has(req.userId!),
    });
  } catch (err) {
    console.error("GET /competitions/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /competitions/:id/eligible-rounds — rounds user can submit ────────────

router.get("/:id/eligible-rounds", async (req: AuthRequest, res: Response) => {
  const compId = String(req.params.id);

  // The competition and its existing submissions are independent reads, so
  // they go out together rather than one after the other.
  const [comp, submitted] = await Promise.all([
    prisma.competition.findUnique({ where: { id: compId } }),
    prisma.competitionRound.findMany({
      where: { competitionId: compId },
      select: { roundId: true },
    }),
  ]);
  if (!comp) { res.status(404).json({ error: "Competition not found" }); return; }

  const submittedIds = new Set(submitted.map((r) => r.roundId));

  const rounds = await prisma.round.findMany({
    where: {
      userId: req.userId!,
      completedAt: { not: null },
      playedAt: { gte: comp.startDate, lte: comp.endDate },
      ...(comp.courseId ? { courseId: comp.courseId } : {}),
    },
    include: {
      course: { select: { name: true, holes: { select: { par: true } } } },
      roundHoles: { select: { strokes: true, hole: { select: { par: true } } } },
    },
    orderBy: { playedAt: "desc" },
  });

  const eligible = rounds
    .filter((r) => !submittedIds.has(r.id))
    .map((r) => {
      const totalStrokes = r.roundHoles.reduce((s, rh) => s + rh.strokes, 0);
      const totalPar = r.roundHoles.reduce((s, rh) => s + rh.hole.par, 0);
      return {
        id: r.id,
        courseName: r.course.name,
        playedAt: r.playedAt,
        totalStrokes,
        scoreToPar: totalStrokes - totalPar,
        holesPlayed: r.roundHoles.length,
      };
    });

  res.json(eligible);
});

// ── DELETE /competitions/:id ──────────────────────────────────────────────────

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const compId = String(req.params.id);

  const comp = await prisma.competition.findUnique({
    where: { id: compId },
    include: { rounds: { select: { id: true } } },
  });

  if (!comp) { res.status(404).json({ error: "Competition not found" }); return; }
  if (comp.creatorId !== req.userId!) { res.status(403).json({ error: "Only the creator can delete" }); return; }

  const status = compStatus(comp.startDate, comp.endDate);
  if (status !== "UPCOMING") {
    res.status(400).json({ error: "Can only delete upcoming competitions" });
    return;
  }

  await prisma.competition.delete({ where: { id: compId } });
  res.json({ success: true });
});

export default router;
