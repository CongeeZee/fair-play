import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM_EMAIL = "Fairplay <noreply@fairplaygolf.app>";

export async function sendVerificationEmail(to: string, token: string) {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const verifyUrl = `${frontendUrl}/verify-email?token=${token}`;

  if (!resend) {
    console.log("RESEND_API_KEY not set — skipping verification email to", to);
    return;
  }

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: "Verify your Fairplay account",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 16px;">
          <h2 style="color: #1a3a2a; margin-bottom: 16px;">Welcome to Fairplay</h2>
          <p style="color: #444; line-height: 1.6;">Click the button below to verify your email address and complete your registration.</p>
          <a href="${verifyUrl}" style="display: inline-block; background: #1a3a2a; color: #fff; padding: 12px 32px; border-radius: 6px; text-decoration: none; margin: 24px 0; font-weight: 600;">Verify Email</a>
          <p style="color: #888; font-size: 14px; line-height: 1.5;">If you didn't create a Fairplay account, you can safely ignore this email.</p>
          <p style="color: #888; font-size: 12px; margin-top: 32px;">Or copy this link: ${verifyUrl}</p>
        </div>
      `,
    });
  } catch (err) {
    console.error("Failed to send verification email:", err);
  }
}
