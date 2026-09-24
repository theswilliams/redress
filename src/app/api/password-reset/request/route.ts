import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { passwordResetRequestSchema } from "@/lib/validation";
import { rateLimit, getClientIp } from "@/lib/security/rateLimit";
import { writeAuditLog } from "@/lib/security/audit";
import { sendPasswordResetEmail } from "@/lib/email/send";
import { isDemoEmail } from "@/lib/demo";

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const { allowed } = await rateLimit(`reset-request:${ip}`, { limit: 5, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  const json = await request.json().catch(() => null);
  const parsed = passwordResetRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });

  // Always respond the same way whether or not the account exists (the shared
  // demo account is silently skipped so its password can't be reset).
  if (user && !isDemoEmail(user.email)) {
    const token = randomBytes(32).toString("hex");
    await db.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 1000 * 60 * 30), // 30 minutes
      },
    });

    await writeAuditLog({ userId: user.id, action: "password_reset.requested", ip });

    const resetPath = `/reset-password/confirm?token=${token}`;
    const resetUrl = new URL(resetPath, request.url).toString();

    const sendResult = await sendPasswordResetEmail({ to: user.email, resetUrl });
    if (!sendResult.ok) {
      // Never leak send failures to the client — that could reveal whether
      // an account exists, or invite retry-spamming. Log it so it's
      // debuggable, and fall through to the identical generic response.
      await writeAuditLog({
        userId: user.id,
        action: "password_reset.email_failed",
        ip,
        metadata: { error: sendResult.error },
      });
    }

    // Local dev convenience: also surface the link directly so the flow is
    // testable without needing a real inbox (real send is still attempted
    // above, in parallel, whenever RESEND_API_KEY is configured).
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({ ok: true, devResetUrl: resetPath });
    }
  }

  return NextResponse.json({ ok: true });
}
