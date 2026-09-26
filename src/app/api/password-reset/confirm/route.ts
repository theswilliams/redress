import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { passwordResetConfirmSchema } from "@/lib/validation";
import { rateLimit, getClientIp } from "@/lib/security/rateLimit";
import { writeAuditLog } from "@/lib/security/audit";
import { isDemoEmail } from "@/lib/demo";
import { hashToken } from "@/lib/security/tokens";

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const { allowed } = await rateLimit(`reset-confirm:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  const json = await request.json().catch(() => null);
  const parsed = passwordResetConfirmSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const record = await db.passwordResetToken.findUnique({ where: { token: hashToken(parsed.data.token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }

  const target = await db.user.findUnique({ where: { id: record.userId }, select: { email: true } });
  if (isDemoEmail(target?.email)) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  // Spend the token first, atomically: of two concurrent requests with the same link, only one
  // resets. (If the password write below then failed, the link is spent and the user requests a new
  // one — never the reverse, where one link could be used twice.)
  const claim = await db.passwordResetToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claim.count !== 1) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }
  await db.user.update({ where: { id: record.userId }, data: { passwordHash } });

  await writeAuditLog({ userId: record.userId, action: "password_reset.completed", ip });

  return NextResponse.json({ ok: true });
}
