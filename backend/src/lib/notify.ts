import prisma from "./prisma";
import { sendPushToUser } from "./pushNotification";

export type NotificationType =
  | "reaction"
  | "comment"
  | "comment_reply"
  | "friend_request"
  | "friend_accepted"
  | "tagged"
  | "competition_invite"
  | "competition_round"
  | "competition_ended"
  | "teetime_invite"
  | "teetime_update"
  | "teetime_reminder";

interface NotifyInput {
  type: NotificationType;
  title: string;
  body: string;
  url: string;
  /** Who caused it — shown as the avatar in the inbox. */
  actorId?: number | null;
}

/**
 * Tell a user about something that happened *to them*: write it to their
 * in-app inbox and send a browser push.
 *
 * The two are independent on purpose. Most people never enable push, so the
 * inbox row is what actually reaches them; and if the inbox write fails (say
 * the table migration has not been applied yet), the push still goes out.
 * Never throws — every caller is fire-and-forget.
 */
export async function notifyUser(userId: number, input: NotifyInput): Promise<void> {
  if (input.actorId != null && input.actorId === userId) return;
  const [row] = await Promise.allSettled([
    prisma.notification.create({
      data: {
        userId,
        actorId: input.actorId ?? null,
        type: input.type,
        title: input.title,
        body: input.body,
        url: input.url,
      },
    }),
    sendPushToUser(userId, input.title, input.body, input.url),
  ]);
  if (row.status === "rejected") {
    console.error("notifyUser: inbox write failed:", row.reason);
  }
}
