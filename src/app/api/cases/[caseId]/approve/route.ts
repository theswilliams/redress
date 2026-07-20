import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserApi } from "@/lib/session";
import { approvalDecisionSchema } from "@/lib/validation";
import { writeAuditLog } from "@/lib/security/audit";
import { rateLimit, getClientIp } from "@/lib/security/rateLimit";
import { containsUnfilledPlaceholder } from "@/lib/ai/safetyLayer";
import { sendClaimEmail } from "@/lib/email/send";

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireUserApi();
  if (!user || !user.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { caseId } = await params;
  const ip = getClientIp(request.headers);

  const { allowed } = rateLimit(`approve:${user.id}`, { limit: 10, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

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
  const { decision, editedBody, decisionNotes, recipientEmail } = parsed.data;

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
    if (!recipientEmail) {
      return NextResponse.json(
        { error: "Enter the merchant's contact email before approving — Redress never guesses or invents one." },
        { status: 400 },
      );
    }

    if (editedBody) {
      await db.communication.update({ where: { id: communication.id }, data: { body: editedBody, draftedBy: "user" } });
    }

    const sendResult = await sendClaimEmail({
      to: recipientEmail,
      subject: finalSubject,
      body: finalBody,
      replyTo: user.email,
    });

    if (sendResult.ok) {
      await db.communication.update({
        where: { id: communication.id },
        data: { recipientEmail, status: "sent", sentAt: new Date(), sendError: null },
      });
      await db.userApproval.update({
        where: { id: approval.id },
        data: { decision, decisionNotes, decidedAt: new Date() },
      });
      await db.case.update({ where: { id: caseId }, data: { status: "submitted" } });
      await db.caseEvent.create({
        data: {
          caseId,
          type: "approval",
          message: `You approved the request. It was sent to ${recipientEmail}.`,
          metadata: JSON.stringify({ providerMessageId: sendResult.providerMessageId }),
        },
      });
    } else if (sendResult.error === "EMAIL_NOT_CONFIGURED") {
      // No email provider is configured — sending is simulated so the
      // workflow (approve -> submitted -> tracked) can be demonstrated
      // end-to-end without silently claiming a real message was delivered.
      await db.communication.update({
        where: { id: communication.id },
        data: { recipientEmail, status: "sent", sentAt: new Date(), sendError: null },
      });
      await db.userApproval.update({
        where: { id: approval.id },
        data: { decision, decisionNotes, decidedAt: new Date() },
      });
      await db.case.update({ where: { id: caseId }, data: { status: "submitted" } });
      await db.caseEvent.create({
        data: {
          caseId,
          type: "approval",
          message: `You approved the request. (Simulated submission to ${recipientEmail} — no email provider is connected in this environment.)`,
        },
      });
    } else {
      // Leave the approval pending so the user can fix the address or retry after a transient provider error.
      await db.communication.update({
        where: { id: communication.id },
        data: { recipientEmail, status: "send_failed", sendError: sendResult.error },
      });
      await db.caseEvent.create({
        data: { caseId, type: "system", message: `Sending to ${recipientEmail} failed: ${sendResult.error}` },
      });
      await writeAuditLog({
        userId: user.id,
        action: "approval.send_failed",
        resource: `case:${caseId}`,
        ip,
        metadata: { recipientEmail, error: sendResult.error },
      });
      return NextResponse.json({ error: `Couldn't send the email: ${sendResult.error}` }, { status: 502 });
    }
  } else {
    await db.userApproval.update({
      where: { id: approval.id },
      data: { decision, decisionNotes, decidedAt: new Date() },
    });
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
