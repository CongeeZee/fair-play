import webPush from "web-push";
import prisma from "./prisma";

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidEmail = process.env.VAPID_EMAIL || "mailto:hello@fairplay.app";

if (vapidPublicKey && vapidPrivateKey) {
  webPush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
}

export async function sendPushToUser(
  userId: number,
  title: string,
  body: string,
  url: string
): Promise<void> {
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.log("VAPID keys not set — skipping push notification");
    return;
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  const payload = JSON.stringify({ title, body, url });

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload
        );
      } catch (err: any) {
        // 410 Gone or 404 = browser unsubscribed, clean up
        if (err.statusCode === 410 || err.statusCode === 404) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error(`Push failed for subscription ${sub.id}:`, err.statusCode || err.message);
        }
      }
    })
  );
}
