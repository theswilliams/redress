import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUserApi } from "@/lib/session";
import { deleteAllUploadsForUser } from "@/lib/storage";
import { writeAuditLog } from "@/lib/security/audit";
import { rateLimit, getClientIp } from "@/lib/security/rateLimit";
import { isDemoEmail } from "@/lib/demo";

const deleteAccountSchema = z.object({ password: z.string().min(1) });

export async function DELETE(request: Request) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIp(request.headers);
  const { allowed } = await rateLimit(`account-delete:${user.id}`, { limit: 5, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  if (isDemoEmail(user.email)) {
    return NextResponse.json({ error: "The shared demo account can't be deleted." }, { status: 403 });
  }

  const parsed = deleteAccountSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const dbUser = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  const passwordValid = await bcrypt.compare(parsed.data.password, dbUser.passwordHash);
  if (!passwordValid) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 400 });
  }

  // Written before the cascade delete; the AuditLog row survives with
  // userId set to null (see prisma schema — AuditLog.user is onDelete:
  // SetNull), preserving the record that an account was deleted.
  await writeAuditLog({ userId: user.id, action: "user.delete_account", ip });

  await deleteAllUploadsForUser(user.id);
  await db.user.delete({ where: { id: user.id } });

  return NextResponse.json({ ok: true });
}
