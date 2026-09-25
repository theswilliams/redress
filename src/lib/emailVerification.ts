import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email/send";
import { writeAuditLog } from "@/lib/security/audit";
import { appUrl } from "@/lib/appUrl";

/** Creates a fresh verification token and attempts to send it. Never throws — send failures are logged, not surfaced. */
export async function issueEmailVerification(params: { userId: string; email: string; requestUrl: string; ip?: string | null }) {
  const token = randomBytes(32).toString("hex");
  await db.emailVerificationToken.create({
    data: {
      token,
      userId: params.userId,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24), // 24 hours
    },
  });

  const verifyPath = `/verify-email?token=${token}`;
  const verifyUrl = appUrl(verifyPath, params.requestUrl); // configured origin, not the Host header

  const sendResult = await sendVerificationEmail({ to: params.email, verifyUrl });
  if (!sendResult.ok) {
    await writeAuditLog({
      userId: params.userId,
      action: "email_verification.send_failed",
      ip: params.ip,
      metadata: { error: sendResult.error },
    });
  }

  return { verifyPath, sent: sendResult.ok };
}
