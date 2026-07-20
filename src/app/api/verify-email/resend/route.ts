import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserApi } from "@/lib/session";
import { rateLimit, getClientIp } from "@/lib/security/rateLimit";
import { issueEmailVerification } from "@/lib/emailVerification";

export async function POST(request: Request) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIp(request.headers);
  const { allowed } = rateLimit(`verify-resend:${user.id}`, { limit: 3, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  const dbUser = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (dbUser.emailVerifiedAt) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  const { verifyPath } = await issueEmailVerification({ userId: user.id, email: dbUser.email, requestUrl: request.url, ip });

  if (process.env.NODE_ENV !== "production") {
    return NextResponse.json({ ok: true, devVerifyUrl: verifyPath });
  }
  return NextResponse.json({ ok: true });
}
