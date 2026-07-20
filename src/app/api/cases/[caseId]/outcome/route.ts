import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUserApi } from "@/lib/session";
import { recordOutcomeSchema, stillWaitingSchema } from "@/lib/validation";
import { writeAuditLog } from "@/lib/security/audit";
import { rateLimit, getClientIp } from "@/lib/security/rateLimit";
import { OUTCOME_TYPE_LABELS, RECORDABLE_OUTCOME_STATUSES, type CaseStatus, type OutcomeType } from "@/lib/types";

const actionSchema = z.object({ action: z.enum(["record_outcome", "mark_waiting"]) });

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { caseId } = await params;
  const ip = getClientIp(request.headers);

  const { allowed } = rateLimit(`outcome:${user.id}`, { limit: 20, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  const caseRecord = await db.case.findUnique({ where: { id: caseId } });
  if (!caseRecord || caseRecord.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!RECORDABLE_OUTCOME_STATUSES.includes(caseRecord.status as CaseStatus)) {
    return NextResponse.json({ error: "This case isn't at a stage where an outcome can be recorded." }, { status: 400 });
  }

  const json = await request.json().catch(() => null);
  const actionParsed = actionSchema.safeParse(json);
  if (!actionParsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  if (actionParsed.data.action === "mark_waiting") {
    const parsed = stillWaitingSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    await db.case.update({ where: { id: caseId }, data: { status: "awaiting_response" } });
    await db.caseEvent.create({
      data: {
        caseId,
        type: "note",
        message: parsed.data.note ? `Still waiting on a response. ${parsed.data.note}` : "Still waiting on a response.",
      },
    });
    return NextResponse.json({ ok: true });
  }

  const parsed = recordOutcomeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { outcomeType, recoveredCents, notes } = parsed.data;

  await db.recoveryOutcome.create({
    data: { caseId, outcomeType, recoveredCents, notes },
  });

  const nextStatus = outcomeType === "no_recovery" ? "rejected" : "resolved";

  await db.case.update({
    where: { id: caseId },
    data: { status: nextStatus, confirmedRecoveryCents: recoveredCents },
  });

  await db.caseEvent.create({
    data: {
      caseId,
      type: "status_change",
      message:
        outcomeType === "no_recovery"
          ? "You recorded this case as resolved with no recovery."
          : `You recorded an outcome: ${OUTCOME_TYPE_LABELS[outcomeType as OutcomeType]}${recoveredCents > 0 ? ` — ${(recoveredCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}` : ""}.`,
    },
  });

  await writeAuditLog({
    userId: user.id,
    action: "outcome.record",
    resource: `case:${caseId}`,
    ip,
    metadata: { outcomeType, recoveredCents },
  });

  return NextResponse.json({ ok: true });
}
