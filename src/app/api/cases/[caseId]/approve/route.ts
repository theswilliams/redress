import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserApi } from "@/lib/session";
import { approvalDecisionSchema } from "@/lib/validation";
import { writeAuditLog } from "@/lib/security/audit";
import { getClientIp } from "@/lib/security/rateLimit";
import { containsUnfilledPlaceholder } from "@/lib/ai/safetyLayer";

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { caseId } = await params;
  const ip = getClientIp(request.headers);

  const caseRecord = await db.case.findUnique({ where: { id: caseId } });
  if (!caseRecord || caseRecord.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const approval = await db.userApproval.findFirst({
    where: { caseId, userId: user.id, decision: "pending" },
    orderBy: { createdAt: "desc" },
  });
  if (!approval) {
    return NextResponse.json({ error: "There is nothing pending approval for this case." }, { status: 400 });
  }

  const json = await request.json().catch(() => null);
  const parsed = approvalDecisionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { decision, editedBody, decisionNotes } = parsed.data;

  const proposedAction = JSON.parse(approval.proposedAction) as { communicationId: string };
  const communication = await db.communication.findUnique({ where: { id: proposedAction.communicationId } });
  if (!communication || communication.caseId !== caseId) {
    return NextResponse.json({ error: "Associated communication not found." }, { status: 400 });
  }

  if (decision === "edited") {
    if (!editedBody) {
      return NextResponse.json({ error: "editedBody is required for an edit." }, { status: 400 });
    }
    await db.communication.update({ where: { id: communication.id }, data: { body: editedBody, draftedBy: "user" } });
    await db.caseEvent.create({
      data: { caseId, type: "note", message: "You edited the drafted message." },
    });
    return NextResponse.json({ ok: true });
  }

  if (decision === "approved") {
    const finalBody = editedBody ?? communication.body;
    const finalSubject = communication.subject ?? "";
    if (containsUnfilledPlaceholder(finalBody) || containsUnfilledPlaceholder(finalSubject)) {
      return NextResponse.json(
        { error: "This message still has an unfilled placeholder (e.g. \"[INSERT ...]\"). Edit it to fill in the details before approving." },
        { status: 400 },
      );
    }
  }

  await db.userApproval.update({
    where: { id: approval.id },
    data: { decision, decisionNotes, decidedAt: new Date() },
  });

  if (decision === "approved") {
    if (editedBody) {
      await db.communication.update({ where: { id: communication.id }, data: { body: editedBody, draftedBy: "user" } });
    }

    // No email/webform provider is configured in this MVP — sending is
    // simulated so the workflow (approve -> submitted -> tracked) can be
    // demonstrated end-to-end without silently claiming a real message was
    // delivered. Wiring a real provider is the integration seam here.
    await db.communication.update({
      where: { id: communication.id },
      data: { status: "sent", sentAt: new Date() },
    });

    await db.case.update({ where: { id: caseId }, data: { status: "submitted" } });

    await db.caseEvent.create({
      data: {
        caseId,
        type: "approval",
        message: "You approved the request. (Simulated submission — no email provider is connected in this environment.)",
      },
    });
  } else {
    await db.case.update({ where: { id: caseId }, data: { status: "closed" } });
    await db.caseEvent.create({
      data: { caseId, type: "approval", message: "You chose not to pursue this recommendation." },
    });
  }

  await writeAuditLog({
    userId: user.id,
    action: "approval.decide",
    resource: `case:${caseId}`,
    ip,
    metadata: { decision },
  });

  return NextResponse.json({ ok: true });
}
