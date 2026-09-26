import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seedDemoAccount } from "@/lib/demoSeed";
import { writeAuditLog } from "@/lib/security/audit";

// Resets the shared demo account once a day (schedule in vercel.json), so one visitor's approvals,
// rejections or uploads don't change what the next visitor sees, and anything uploaded to the shared
// account is removed within a day.
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed: without a configured secret nobody can trigger a reset
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await seedDemoAccount(db);
  await writeAuditLog({ action: "demo.reset" });
  return NextResponse.json({ ok: true });
}
