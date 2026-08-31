import { Router, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { requireVerifiedEmail } from "../middleware/requireVerifiedEmail";
import { sendPushToUser } from "../lib/pushNotification";

const router = Router();

router.use(requireAuth);

router.use(requireVerifiedEmail("Verify your email to use tee times"));

// Helper: get accepted friend IDs (excluding blocked)
async function getFriendIds(userId: number): Promise<number[]> {
  const [friendships, blocks] = await Promise.all([
    prisma.friendship.findMany({
      where: { status: "ACCEPTED", OR: [{ requesterId: userId }, { addresseeId: userId }] },
      select: { requesterId: true, addresseeId: true },
    }),
    prisma.friendship.findMany({
      where: { status: "BLOCKED", OR: [{ requesterId: userId }, { addresseeId: userId }] },
      select: { requesterId: true, addresseeId: true },
    }),
  ]);
  const ids = friendships.map((f) => (f.requesterId === userId ? f.addresseeId : f.requesterId));
  const blockedIds = new Set(blocks.map((b) => (b.requesterId === userId ? b.addresseeId : b.requesterId)));
  return ids.filter((id) => !blockedIds.has(id));
}

// Helper: format course display name
function teeTimeCourseName(tt: { courseId: number | null; courseName: string | null; course?: { name: string } | null }): string | null {
  if (tt.courseId && tt.course) return tt.course.name;
  return tt.courseName ?? null;
}

// Helper: format date for notifications
function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

// Helper: count confirmed participants
function confirmedCount(participants: { status: string }[]): number {
  return participants.filter((p) => p.status === "CONFIRMED").length;
}

// Stale tee time cleanup: mark past tee times as COMPLETED
async function cleanupStaleTeetimes(): Promise<void> {
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  await prisma.teeTime.updateMany({
    where: { dateTime: { lt: sixHoursAgo }, status: { in: ["OPEN", "FULL"] } },
    data: { status: "COMPLETED" },
  });
}

// Send 24-hour reminders for upcoming tee times
async function sendReminders(): Promise<void> {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const upcoming = await prisma.teeTime.findMany({
    where: {
      reminderSent: false,
      status: { in: ["OPEN", "FULL"] },
      dateTime: { gt: now, lte: in24h },
    },
    include: {
      course: { select: { name: true } },
      participants: {
        where: { status: "CONFIRMED" },
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });

  for (const tt of upcoming) {
    const courseName = teeTimeCourseName(tt) || "Golf";
    const timeStr = tt.dateTime.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
    const names = tt.participants.map((p) => p.user.name).join(", ");
    const body = `Reminder: ${courseName} tomorrow at ${timeStr} with ${names}`;

    for (const p of tt.participants) {
      sendPushToUser(p.userId, "Tee Time Tomorrow", body, `/teetimes/${tt.id}`).catch(() => {});
    }

    prisma.teeTime.update({ where: { id: tt.id }, data: { reminderSent: true } }).catch(() => {});
  }
}

// ── POST /teetimes — create a tee time ──────────────────────────────────────

const createSchema = z.object({
  courseId: z.number().int().optional(),
  courseName: z.string().max(100).optional(),
  dateTime: z.string(),
  spotsTotal: z.number().int().min(2).max(8),
  notes: z.string().max(200).optional(),
  visibility: z.enum(["FRIENDS", "INVITED_ONLY"]).default("FRIENDS"),
  inviteUserIds: z.array(z.number().int()).optional(),
});

router.post("/", async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  const { courseId, courseName, dateTime: dtStr, spotsTotal, notes, visibility, inviteUserIds } = parsed.data;
  const dateTime = new Date(dtStr);

  if (dateTime <= new Date()) {
    res.status(400).json({ error: "Date must be in the future" });
    return;
  }

  if (!courseId && !courseName) {
    // Both are optional — course TBD is allowed
  }

  if (courseId) {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) { res.status(404).json({ error: "Course not found" }); return; }
  }

  try {
    const tt = await prisma.teeTime.create({
      data: {
        creatorId: req.userId!,
        courseId: courseId ?? null,
        courseName: courseId ? null : (courseName ?? null),
        dateTime,
        spotsTotal,
        notes: notes ?? null,
        visibility,
        status: "OPEN",
        participants: {
          create: { userId: req.userId!, status: "CONFIRMED" },
        },
      },
      include: {
        course: { select: { id: true, name: true } },
        participants: { include: { user: { select: { id: true, name: true } } } },
        creator: { select: { id: true, name: true } },
      },
    });

    // Invite friends if INVITED_ONLY and userIds provided
    if (inviteUserIds && inviteUserIds.length > 0) {
      const friendIds = await getFriendIds(req.userId!);
      const friendIdSet = new Set(friendIds);
      const validIds = inviteUserIds.filter((id) => friendIdSet.has(id));

      if (validIds.length > 0) {
        await prisma.teeTimeParticipant.createMany({
          data: validIds.map((userId) => ({ teeTimeId: tt.id, userId, status: "INVITED" as const })),
          skipDuplicates: true,
        });

        const cName = teeTimeCourseName(tt) || "golf";
        for (const userId of validIds) {
          sendPushToUser(userId, "Tee Time Invite", `${tt.creator.name} invited you to play ${cName} on ${fmtDate(dateTime)}`, `/teetimes/${tt.id}`).catch(() => {});
        }
      }
    }

    res.status(201).json(tt);
  } catch (err) {
    console.error("POST /teetimes error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /teetimes/:id/invite — invite friends ─────────────────────────────

const inviteSchema = z.object({
  userIds: z.array(z.number().int()).min(1),
});

router.post("/:id/invite", async (req: AuthRequest, res: Response) => {
  const ttId = String(req.params.id);
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const tt = await prisma.teeTime.findUnique({
    where: { id: ttId },
    include: {
      course: { select: { name: true } },
      participants: { select: { userId: true } },
    },
  });

  if (!tt) { res.status(404).json({ error: "Tee time not found" }); return; }
  if (tt.creatorId !== req.userId!) { res.status(403).json({ error: "Only the creator can invite" }); return; }
  if (tt.status === "CANCELLED") { res.status(400).json({ error: "Tee time is cancelled" }); return; }

  const existingIds = new Set(tt.participants.map((p) => p.userId));
  const newIds = parsed.data.userIds.filter((id) => !existingIds.has(id));

  const friendIds = await getFriendIds(req.userId!);
  const friendIdSet = new Set(friendIds);
  const validIds = newIds.filter((id) => friendIdSet.has(id));

  if (validIds.length === 0) {
    res.status(400).json({ error: "No valid friends to invite" });
    return;
  }

  await prisma.teeTimeParticipant.createMany({
    data: validIds.map((userId) => ({ teeTimeId: ttId, userId, status: "INVITED" as const })),
    skipDuplicates: true,
  });

  const creator = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
  const cName = teeTimeCourseName(tt) || "golf";
  for (const userId of validIds) {
    sendPushToUser(userId, "Tee Time Invite", `${creator?.name} invited you to play ${cName} on ${fmtDate(tt.dateTime)}`, `/teetimes/${ttId}`).catch(() => {});
  }

  res.json({ invited: validIds.length });
});

// ── POST /teetimes/:id/join — join an open tee time ─────────────────────────

router.post("/:id/join", async (req: AuthRequest, res: Response) => {
  const ttId = String(req.params.id);

  const tt = await prisma.teeTime.findUnique({
    where: { id: ttId },
    include: {
      course: { select: { name: true } },
      participants: { select: { userId: true, status: true } },
    },
  });

  if (!tt) { res.status(404).json({ error: "Tee time not found" }); return; }
  if (tt.status !== "OPEN") { res.status(400).json({ error: "Tee time is not open for joining" }); return; }
  if (tt.visibility !== "FRIENDS") { res.status(403).json({ error: "This tee time is invite-only" }); return; }

  // Must be a friend of the creator
  const friendIds = await getFriendIds(tt.creatorId);
  if (!friendIds.includes(req.userId!)) {
    res.status(403).json({ error: "You must be friends with the creator" });
    return;
  }

  // Check not already a participant
  const existing = tt.participants.find((p) => p.userId === req.userId!);
  if (existing) {
    res.status(400).json({ error: "You are already part of this tee time" });
    return;
  }

  // Check spots available
  const confirmed = confirmedCount(tt.participants);
  if (confirmed >= tt.spotsTotal) {
    res.status(400).json({ error: "No spots available" });
    return;
  }

  await prisma.teeTimeParticipant.create({
    data: { teeTimeId: ttId, userId: req.userId!, status: "CONFIRMED" },
  });

  // If now full, update status
  if (confirmed + 1 >= tt.spotsTotal) {
    await prisma.teeTime.update({ where: { id: ttId }, data: { status: "FULL" } });
  }

  // Notify creator
  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
  sendPushToUser(tt.creatorId, "Tee Time Update", `${user?.name} is joining your round on ${fmtDate(tt.dateTime)}`, `/teetimes/${ttId}`).catch(() => {});

  res.json({ status: "CONFIRMED" });
});

// ── POST /teetimes/:id/respond — respond to invitation ──────────────────────

const respondSchema = z.object({
  response: z.enum(["CONFIRMED", "DECLINED"]),
});

router.post("/:id/respond", async (req: AuthRequest, res: Response) => {
  const ttId = String(req.params.id);
  const parsed = respondSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid response" }); return; }

  const participant = await prisma.teeTimeParticipant.findUnique({
    where: { teeTimeId_userId: { teeTimeId: ttId, userId: req.userId! } },
  });

  if (!participant) { res.status(404).json({ error: "Invitation not found" }); return; }
  if (participant.status !== "INVITED") { res.status(400).json({ error: "Already responded" }); return; }

  const tt = await prisma.teeTime.findUnique({
    where: { id: ttId },
    include: { participants: { select: { status: true } } },
  });
  if (!tt) { res.status(404).json({ error: "Tee time not found" }); return; }

  if (parsed.data.response === "CONFIRMED") {
    const confirmed = confirmedCount(tt.participants);
    if (confirmed >= tt.spotsTotal) {
      res.status(400).json({ error: "No spots available" });
      return;
    }

    await prisma.teeTimeParticipant.update({
      where: { id: participant.id },
      data: { status: "CONFIRMED" },
    });

    // If now full, update status
    if (confirmed + 1 >= tt.spotsTotal) {
      await prisma.teeTime.update({ where: { id: ttId }, data: { status: "FULL" } });
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
    sendPushToUser(tt.creatorId, "Tee Time Update", `${user?.name} is in for ${fmtDate(tt.dateTime)}`, `/teetimes/${ttId}`).catch(() => {});
  } else {
    await prisma.teeTimeParticipant.update({
      where: { id: participant.id },
      data: { status: "DECLINED" },
    });

    const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
    sendPushToUser(tt.creatorId, "Tee Time Update", `${user?.name} can't make ${fmtDate(tt.dateTime)}`, `/teetimes/${ttId}`).catch(() => {});
  }

  res.json({ status: parsed.data.response });
});

// ── POST /teetimes/:id/withdraw — withdraw from tee time ────────────────────

router.post("/:id/withdraw", async (req: AuthRequest, res: Response) => {
  const ttId = String(req.params.id);

  const tt = await prisma.teeTime.findUnique({
    where: { id: ttId },
    include: { participants: { select: { userId: true, status: true } } },
  });

  if (!tt) { res.status(404).json({ error: "Tee time not found" }); return; }
  if (tt.creatorId === req.userId!) {
    res.status(400).json({ error: "Creator cannot withdraw — cancel the tee time instead" });
    return;
  }

  const participant = tt.participants.find((p) => p.userId === req.userId!);
  if (!participant || !["CONFIRMED", "INVITED"].includes(participant.status)) {
    res.status(400).json({ error: "You are not part of this tee time" });
    return;
  }

  await prisma.teeTimeParticipant.updateMany({
    where: { teeTimeId: ttId, userId: req.userId! },
    data: { status: "WITHDRAWN" },
  });

  // If was FULL, set back to OPEN
  if (tt.status === "FULL" && participant.status === "CONFIRMED") {
    await prisma.teeTime.update({ where: { id: ttId }, data: { status: "OPEN" } });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
  sendPushToUser(tt.creatorId, "Tee Time Update", `${user?.name} dropped out of your round on ${fmtDate(tt.dateTime)}`, `/teetimes/${ttId}`).catch(() => {});

  res.json({ status: "WITHDRAWN" });
});

// ── POST /teetimes/:id/cancel — cancel tee time ─────────────────────────────

router.post("/:id/cancel", async (req: AuthRequest, res: Response) => {
  const ttId = String(req.params.id);

  const tt = await prisma.teeTime.findUnique({
    where: { id: ttId },
    include: {
      course: { select: { name: true } },
      participants: { where: { status: { in: ["CONFIRMED", "INVITED"] } }, select: { userId: true } },
    },
  });

  if (!tt) { res.status(404).json({ error: "Tee time not found" }); return; }
  if (tt.creatorId !== req.userId!) { res.status(403).json({ error: "Only the creator can cancel" }); return; }
  if (tt.status === "CANCELLED") { res.status(400).json({ error: "Already cancelled" }); return; }

  await prisma.teeTime.update({ where: { id: ttId }, data: { status: "CANCELLED" } });

  const creator = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
  const cName = teeTimeCourseName(tt) || "the round";
  for (const p of tt.participants) {
    if (p.userId !== req.userId!) {
      sendPushToUser(p.userId, "Tee Time Cancelled", `${creator?.name} cancelled ${cName} on ${fmtDate(tt.dateTime)}`, `/teetimes`).catch(() => {});
    }
  }

  res.json({ status: "CANCELLED" });
});

// ── PATCH /teetimes/:id — update tee time details ───────────────────────────

const updateSchema = z.object({
  courseId: z.number().int().nullable().optional(),
  courseName: z.string().max(100).nullable().optional(),
  dateTime: z.string().optional(),
  spotsTotal: z.number().int().min(2).max(8).optional(),
  notes: z.string().max(200).nullable().optional(),
});

router.patch("/:id", async (req: AuthRequest, res: Response) => {
  const ttId = String(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const tt = await prisma.teeTime.findUnique({
    where: { id: ttId },
    include: {
      course: { select: { name: true } },
      participants: { select: { userId: true, status: true } },
    },
  });

  if (!tt) { res.status(404).json({ error: "Tee time not found" }); return; }
  if (tt.creatorId !== req.userId!) { res.status(403).json({ error: "Only the creator can edit" }); return; }
  if (tt.status === "CANCELLED" || tt.status === "COMPLETED") {
    res.status(400).json({ error: "Cannot edit a cancelled or completed tee time" });
    return;
  }

  const data: Record<string, unknown> = {};

  if (parsed.data.courseId !== undefined) {
    if (parsed.data.courseId !== null) {
      const course = await prisma.course.findUnique({ where: { id: parsed.data.courseId } });
      if (!course) { res.status(404).json({ error: "Course not found" }); return; }
    }
    data.courseId = parsed.data.courseId;
    data.courseName = null; // clear freeform if setting courseId
  }
  if (parsed.data.courseName !== undefined && parsed.data.courseId === undefined) {
    data.courseName = parsed.data.courseName;
  }

  if (parsed.data.dateTime !== undefined) {
    const newDt = new Date(parsed.data.dateTime);
    if (newDt <= new Date()) { res.status(400).json({ error: "Date must be in the future" }); return; }
    data.dateTime = newDt;
  }

  if (parsed.data.spotsTotal !== undefined) {
    const confirmed = confirmedCount(tt.participants);
    if (parsed.data.spotsTotal < confirmed) {
      res.status(400).json({ error: `Cannot reduce spots below current confirmed count (${confirmed})` });
      return;
    }
    data.spotsTotal = parsed.data.spotsTotal;

    // Update status if needed
    if (confirmed >= parsed.data.spotsTotal && tt.status === "OPEN") {
      data.status = "FULL";
    } else if (confirmed < parsed.data.spotsTotal && tt.status === "FULL") {
      data.status = "OPEN";
    }
  }

  if (parsed.data.notes !== undefined) {
    data.notes = parsed.data.notes;
  }

  const updated = await prisma.teeTime.update({
    where: { id: ttId },
    data,
    include: {
      course: { select: { id: true, name: true } },
      participants: { include: { user: { select: { id: true, name: true } } } },
      creator: { select: { id: true, name: true } },
    },
  });

  // Notify confirmed participants if dateTime changed
  if (parsed.data.dateTime) {
    const creator = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
    const cName = teeTimeCourseName(updated) || "the round";
    const confirmedParticipants = tt.participants.filter((p) => p.status === "CONFIRMED" && p.userId !== req.userId!);
    for (const p of confirmedParticipants) {
      sendPushToUser(p.userId, "Time Changed", `${creator?.name} changed the time for ${cName} to ${fmtDate(updated.dateTime)}`, `/teetimes/${ttId}`).catch(() => {});
    }
  }

  res.json(updated);
});

// ── GET /teetimes — list relevant tee times ─────────────────────────────────

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    // Cleanup stale tee times and send reminders
    await cleanupStaleTeetimes();
    sendReminders().catch(() => {});

    const userId = req.userId!;
    const now = new Date();
    const friendIds = await getFriendIds(userId);

    // Run independent queries in parallel
    const [myUpcoming, invitations, myParticipantTeeTimeIds] = await Promise.all([
      // My upcoming: created by me or I'm CONFIRMED, future, not cancelled
      prisma.teeTime.findMany({
        where: {
          dateTime: { gt: now },
          status: { not: "CANCELLED" },
          participants: { some: { userId, status: "CONFIRMED" } },
        },
        include: {
          course: { select: { id: true, name: true } },
          creator: { select: { id: true, name: true } },
          participants: {
            where: { status: { in: ["CONFIRMED", "INVITED"] } },
            include: { user: { select: { id: true, name: true } } },
          },
        },
        orderBy: { dateTime: "asc" },
      }),
      // Invitations: where I'm INVITED
      prisma.teeTime.findMany({
        where: {
          dateTime: { gt: now },
          status: { not: "CANCELLED" },
          participants: { some: { userId, status: "INVITED" } },
        },
        include: {
          course: { select: { id: true, name: true } },
          creator: { select: { id: true, name: true } },
          participants: {
            where: { status: "CONFIRMED" },
            include: { user: { select: { id: true, name: true } } },
          },
        },
        orderBy: { dateTime: "asc" },
      }),
      // Friends' open tee times: OPEN, FRIENDS visibility, by friends, I'm not a participant
      prisma.teeTimeParticipant.findMany({
        where: { userId },
        select: { teeTimeId: true },
      }),
    ]);
    const myTeeTimeIds = new Set(myParticipantTeeTimeIds.map((p) => p.teeTimeId));

    const friendsTeeTimes = friendIds.length > 0
      ? await prisma.teeTime.findMany({
          where: {
            creatorId: { in: friendIds },
            visibility: "FRIENDS",
            status: "OPEN",
            dateTime: { gt: now },
            id: { notIn: [...myTeeTimeIds] },
          },
          include: {
            course: { select: { id: true, name: true } },
            creator: { select: { id: true, name: true } },
            participants: {
              where: { status: "CONFIRMED" },
              include: { user: { select: { id: true, name: true } } },
            },
          },
          orderBy: { dateTime: "asc" },
        })
      : [];

    const mapTeeTime = (tt: typeof myUpcoming[0]) => ({
      id: tt.id,
      creatorId: tt.creatorId,
      creatorName: tt.creator.name,
      course: tt.course ? { id: tt.course.id, name: tt.course.name } : null,
      courseName: teeTimeCourseName(tt),
      dateTime: tt.dateTime,
      spotsTotal: tt.spotsTotal,
      spotsFilled: tt.participants.filter((p) => p.status === "CONFIRMED").length,
      notes: tt.notes,
      visibility: tt.visibility,
      status: tt.status,
      participants: tt.participants.map((p) => ({
        userId: p.userId,
        name: p.user.name,
        status: p.status,
      })),
    });

    res.json({
      myUpcoming: myUpcoming.map(mapTeeTime),
      invitations: invitations.map(mapTeeTime),
      friendsTeeTimes: friendsTeeTimes.map(mapTeeTime),
    });
  } catch (err) {
    console.error("GET /teetimes error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /teetimes/:id — tee time detail ─────────────────────────────────────

router.get("/:id", async (req: AuthRequest, res: Response) => {
  const ttId = String(req.params.id);

  try {
    const tt = await prisma.teeTime.findUnique({
      where: { id: ttId },
      include: {
        course: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
        participants: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });

    if (!tt) { res.status(404).json({ error: "Tee time not found" }); return; }

    // Check access: must be creator, participant, or friend of creator (for FRIENDS visibility)
    const isParticipant = tt.participants.some((p) => p.userId === req.userId!);
    const isCreator = tt.creatorId === req.userId!;

    if (!isParticipant && !isCreator) {
      if (tt.visibility === "FRIENDS") {
        const friendIds = await getFriendIds(tt.creatorId);
        if (!friendIds.includes(req.userId!)) {
          res.status(403).json({ error: "Not authorized to view this tee time" });
          return;
        }
      } else {
        res.status(403).json({ error: "Not authorized to view this tee time" });
        return;
      }
    }

    const confirmed = tt.participants.filter((p) => p.status === "CONFIRMED");
    const myParticipant = tt.participants.find((p) => p.userId === req.userId!);

    // Can join? Only if FRIENDS visibility, OPEN, user is friend, not already participant
    let canJoin = false;
    if (!isParticipant && !isCreator && tt.visibility === "FRIENDS" && tt.status === "OPEN") {
      canJoin = confirmed.length < tt.spotsTotal;
    }

    res.json({
      id: tt.id,
      creatorId: tt.creatorId,
      creator: tt.creator,
      course: tt.course,
      courseName: teeTimeCourseName(tt),
      dateTime: tt.dateTime,
      spotsTotal: tt.spotsTotal,
      spotsFilled: confirmed.length,
      notes: tt.notes,
      visibility: tt.visibility,
      status: tt.status,
      participants: tt.participants.map((p) => ({
        userId: p.userId,
        name: p.user.name,
        status: p.status,
      })),
      myStatus: myParticipant?.status ?? null,
      canJoin,
    });
  } catch (err) {
    console.error("GET /teetimes/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /teetimes/:id — delete tee time ──────────────────────────────────

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const ttId = String(req.params.id);

  const tt = await prisma.teeTime.findUnique({
    where: { id: ttId },
    include: {
      course: { select: { name: true } },
      participants: { where: { status: { in: ["CONFIRMED", "INVITED"] } }, select: { userId: true } },
    },
  });

  if (!tt) { res.status(404).json({ error: "Tee time not found" }); return; }
  if (tt.creatorId !== req.userId!) { res.status(403).json({ error: "Only the creator can delete" }); return; }

  if (!["OPEN", "CANCELLED"].includes(tt.status)) {
    res.status(400).json({ error: "Can only delete open or cancelled tee times" });
    return;
  }
  if (tt.dateTime <= new Date()) {
    res.status(400).json({ error: "Cannot delete past tee times" });
    return;
  }

  await prisma.teeTime.delete({ where: { id: ttId } });

  // Notify participants
  const creator = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
  const cName = teeTimeCourseName(tt) || "the round";
  for (const p of tt.participants) {
    if (p.userId !== req.userId!) {
      sendPushToUser(p.userId, "Tee Time Removed", `${creator?.name} removed ${cName} on ${fmtDate(tt.dateTime)}`, `/teetimes`).catch(() => {});
    }
  }

  res.json({ success: true });
});

export default router;
