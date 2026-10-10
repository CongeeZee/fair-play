import prisma from "./prisma";

/**
 * Ids of the user's accepted friends, minus anyone blocked in either direction.
 *
 * One query rather than the two (accepted, then blocked) that several routes
 * each used to run back to back. Against the Supabase pooler a round-trip is
 * worth ~1s, and this lookup sits at the front of the feed, the live-rounds
 * strip, both leaderboards and every tee-time and profile request — so the
 * second serial query was paid on nearly every screen.
 *
 * Blocking deletes the pair's existing row before writing the BLOCKED one, so
 * an ACCEPTED and a BLOCKED row should never coexist; the filter is kept so a
 * stray legacy row still fails closed.
 */
export async function getActiveFriendIds(userId: number): Promise<number[]> {
  const rows = await prisma.friendship.findMany({
    where: {
      status: { in: ["ACCEPTED", "BLOCKED"] },
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    select: { requesterId: true, addresseeId: true, status: true },
  });
  const other = (r: { requesterId: number; addresseeId: number }) =>
    r.requesterId === userId ? r.addresseeId : r.requesterId;
  const blocked = new Set(rows.filter((r) => r.status === "BLOCKED").map(other));
  return rows
    .filter((r) => r.status === "ACCEPTED")
    .map(other)
    .filter((id) => !blocked.has(id));
}

/** True when the two users are accepted friends (or the same user). */
export async function isFriendOrSelf(userId: number, targetUserId: number): Promise<boolean> {
  if (userId === targetUserId) return true;
  const friendship = await prisma.friendship.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: userId, addresseeId: targetUserId },
        { requesterId: targetUserId, addresseeId: userId },
      ],
    },
    select: { id: true },
  });
  return !!friendship;
}
