import { Router, Request, Response } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import type { PrismaPromise } from "@prisma/client";
import prisma from "../lib/prisma";
import { requireAuth, type AuthRequest } from "../middleware/auth";

const router = Router();

const createInviteSchema = z.object({
  label: z.string().trim().min(1).max(50).optional(),
  maxUses: z.number().int().positive().max(1000).optional(),
  expiresInDays: z.number().int().positive().max(365).optional(),
});

// POST /invites — create a new invite link
router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = createInviteSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const { label, maxUses, expiresInDays } = parsed.data;
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const link = await prisma.inviteLink.create({
      data: {
        code: nanoid(10),
        creatorId: req.userId!,
        label: label ?? null,
        maxUses: maxUses ?? null,
        expiresAt,
      },
      select: {
        id: true,
        code: true,
        label: true,
        maxUses: true,
        uses: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    res.status(201).json(link);
  } catch (err) {
    console.error("POST /invites error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /invites/mine — list current user's invite links
router.get("/mine", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const links = await prisma.inviteLink.findMany({
      where: { creatorId: req.userId! },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        label: true,
        maxUses: true,
        uses: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    res.json(links);
  } catch (err) {
    console.error("GET /invites/mine error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /invites/:code — public preview (no auth required)
router.get("/:code", async (req: Request, res: Response) => {
  const code = String(req.params.code);
  try {
    const link = await prisma.inviteLink.findUnique({
      where: { code },
      select: {
        code: true,
        label: true,
        maxUses: true,
        uses: true,
        expiresAt: true,
        creator: { select: { id: true, name: true } },
      },
    });

    if (!link) {
      res.status(404).json({ error: "Invite link not found" });
      return;
    }

    const expired = link.expiresAt ? link.expiresAt < new Date() : false;
    const exhausted = link.maxUses != null ? link.uses >= link.maxUses : false;

    res.json({
      code: link.code,
      label: link.label,
      inviter: { id: link.creator.id, name: link.creator.name },
      expired,
      exhausted,
      valid: !expired && !exhausted,
    });
  } catch (err) {
    console.error("GET /invites/:code error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /invites/:code/accept — authenticated user redeems the link
router.post(
  "/:code/accept",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const code = String(req.params.code);
    const userId = req.userId!;

    try {
      const link = await prisma.inviteLink.findUnique({ where: { code } });
      if (!link) {
        res.status(404).json({ error: "Invite link not found" });
        return;
      }

      if (link.creatorId === userId) {
        res.status(400).json({ error: "You can't accept your own invite link" });
        return;
      }

      if (link.expiresAt && link.expiresAt < new Date()) {
        res.status(410).json({ error: "Invite link has expired" });
        return;
      }

      if (link.maxUses != null && link.uses >= link.maxUses) {
        res.status(410).json({ error: "Invite link has reached its usage limit" });
        return;
      }

      // Idempotency: if user already accepted this link, return the existing
      // cluster of connections without creating duplicates.
      const existingAcceptance = await prisma.inviteAcceptance.findUnique({
        where: { inviteLinkId_userId: { inviteLinkId: link.id, userId } },
      });

      if (existingAcceptance) {
        const friendsCount = await countAcceptedFriends(userId);
        res.json({
          success: true,
          alreadyAccepted: true,
          inviter: { id: link.creatorId },
          friendsAdded: 0,
          totalFriends: friendsCount,
        });
        return;
      }

      // Determine the cluster: creator + everyone who accepted this link, plus
      // (if the link has a label) anyone who accepted another link from the
      // same creator with the same label. This is what turns a society into
      // a mutually-connected graph rather than a hub-and-spoke.
      const clusterLinkIds = await collectClusterLinkIds(
        link.id,
        link.creatorId,
        link.label,
      );

      const otherAcceptors = await prisma.inviteAcceptance.findMany({
        where: {
          inviteLinkId: { in: clusterLinkIds },
          userId: { not: userId },
        },
        select: { userId: true },
      });

      // Targets = creator + distinct other acceptors, excluding self.
      const targetIds = new Set<number>();
      targetIds.add(link.creatorId);
      for (const a of otherAcceptors) targetIds.add(a.userId);
      targetIds.delete(userId);

      const targetArr = [...targetIds];

      // Find existing friendships in either direction so we don't violate the
      // unique pair constraint or stomp on BLOCKED entries.
      const existingPairs = targetArr.length
        ? await prisma.friendship.findMany({
            where: {
              OR: [
                { requesterId: userId, addresseeId: { in: targetArr } },
                { requesterId: { in: targetArr }, addresseeId: userId },
              ],
            },
            select: {
              id: true,
              requesterId: true,
              addresseeId: true,
              status: true,
            },
          })
        : [];

      const pairState = new Map<
        number,
        { id: string; status: string; requesterId: number }
      >();
      for (const f of existingPairs) {
        const other = f.requesterId === userId ? f.addresseeId : f.requesterId;
        pairState.set(other, {
          id: f.id,
          status: f.status,
          requesterId: f.requesterId,
        });
      }

      const friendshipCreates: { requesterId: number; addresseeId: number }[] =
        [];
      const friendshipUpdates: string[] = [];

      for (const otherId of targetArr) {
        const existing = pairState.get(otherId);
        if (!existing) {
          friendshipCreates.push({ requesterId: userId, addresseeId: otherId });
        } else if (existing.status === "BLOCKED") {
          // Respect blocks — skip silently.
          continue;
        } else if (existing.status === "PENDING") {
          // Auto-accept any pending pair both ways.
          friendshipUpdates.push(existing.id);
        }
        // ACCEPTED → already connected, no-op.
      }

      // Atomically: record acceptance, bump uses, create/accept friendships.
      const tx: PrismaPromise<unknown>[] = [
        prisma.inviteAcceptance.create({
          data: { inviteLinkId: link.id, userId },
        }),
        prisma.inviteLink.update({
          where: { id: link.id },
          data: { uses: { increment: 1 } },
        }),
      ];
      if (friendshipCreates.length > 0) {
        tx.push(
          prisma.friendship.createMany({
            data: friendshipCreates.map((f) => ({
              ...f,
              status: "ACCEPTED" as const,
            })),
            skipDuplicates: true,
          }),
        );
      }
      if (friendshipUpdates.length > 0) {
        tx.push(
          prisma.friendship.updateMany({
            where: { id: { in: friendshipUpdates } },
            data: { status: "ACCEPTED" },
          }),
        );
      }

      await prisma.$transaction(tx);

      const totalFriends = await countAcceptedFriends(userId);

      res.json({
        success: true,
        alreadyAccepted: false,
        inviter: { id: link.creatorId },
        friendsAdded: friendshipCreates.length + friendshipUpdates.length,
        totalFriends,
      });
    } catch (err) {
      console.error("POST /invites/:code/accept error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

async function collectClusterLinkIds(
  selfLinkId: string,
  creatorId: number,
  label: string | null,
): Promise<string[]> {
  if (!label) return [selfLinkId];
  const sameLabelLinks = await prisma.inviteLink.findMany({
    where: { creatorId, label },
    select: { id: true },
  });
  return sameLabelLinks.map((l) => l.id);
}

async function countAcceptedFriends(userId: number): Promise<number> {
  return prisma.friendship.count({
    where: {
      status: "ACCEPTED",
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
  });
}

export default router;
