import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { signUpSchema } from "@/lib/validation";
import { rateLimit, getClientIp } from "@/lib/security/rateLimit";
import { writeAuditLog } from "@/lib/security/audit";
import { issueEmailVerification } from "@/lib/emailVerification";

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const { allowed } = await rateLimit(`register:${ip}`, { limit: 5, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  const json = await request.json().catch(() => null);
  const parsed = signUpSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { name, email, password } = parsed.data;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    // Do not reveal which emails are registered.
    return NextResponse.json({ ok: true });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await db.user.create({
    data: { email, name, passwordHash },
  });

  await writeAuditLog({
    userId: user.id,
    action: "user.register",
    resource: `user:${user.id}`,
    ip,
  });

  const { verifyPath } = await issueEmailVerification({ userId: user.id, email: user.email, requestUrl: request.url, ip });

  // Local dev convenience, same pattern as password reset.
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.json({ ok: true, devVerifyUrl: verifyPath });
  }

  return NextResponse.json({ ok: true });
}
