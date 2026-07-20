import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { passwordResetRequestSchema } from "@/lib/validation";
import { rateLimit, getClientIp } from "@/lib/security/rateLimit";
import { writeAuditLog } from "@/lib/security/audit";

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const { allowed } = rateLimit(`reset-request:${ip}`, { limit: 5, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  const json = await request.json().catch(() => null);
  const parsed = passwordResetRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });

  // Always respond the same way whether or not the account exists.
  if (user) {
    const token = randomBytes(32).toString("hex");
    await db.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 1000 * 60 * 30), // 30 minutes
      },
    });

    await writeAuditLog({ userId: user.id, action: "password_reset.requested", ip });

    // In production this token would be emailed to the user rather than
    // returned in a dev-only response. No email provider is configured in
    // this MVP, so we surface the reset link directly for local testing.
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({ ok: true, devResetUrl: `/reset-password/confirm?token=${token}` });
    }
  }

  return NextResponse.json({ ok: true });
}
