import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserApi } from "@/lib/session";
import { approvalDecisionSchema } from "@/lib/validation";
import { writeAuditLog } from "@/lib/security/audit";
import { rateLimit, getClientIp } from "@/lib/security/rateLimit";
import { containsUnfilledPlaceholder } from "@/lib/ai/safetyLayer";
import { sendClaimEmail } from "@/lib/email/send";
import { isEmailConfigured } from "@/lib/email/client";
import { isDemoEmail } from "@/lib/demo";

const ALREADY_HANDLED = "This request has already been handled. Refresh the page to see its current status.";

function readCommunicationId(proposedAction: string): string | null {
  try {
    const parsed = JSON.parse(proposedAction) as { communicationId?: unknown };
    return typeof parsed.communicationId === "string" ? parsed.communicationId : null;
  } catch {
    return null;
  }
}

/**
 * The human-approval gate. Nothing is ever sent except through the "approved" branch below.
 *
 * One-time semantics: an approval moves pending -> sending in a single conditional update
 * (`updateMany ... where decision = "pending"`). Only the request that wins that update may send,
 * so two concurrent clicks (or a replayed request) can't send the same message twice. If the send
 * fails, the approval goes back to pending so the user can fix the address and retry. If the process
 * dies after a successful send but before the final write, the approval stays "sending" and is never
 * re-sent: a stuck record is preferable to a duplicate email to a merchant.
 */
export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireUserApi();
  if (!user || !user.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { caseId } = await params;
  const ip = getClientIp(request.headers);

  const { allowed } = await rateLimit(`approve:${user.id}`, { limit: 10, windowMs: 60_000 });
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

  const communicationId = readCommunicationId(approval.proposedAction);
  const communication = communicationId ? await db.communication.findUnique({ where: { id: communicationId } }) : null;
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

  if (decision === "rejected") {
    const claimed = await db.userApproval.updateMany({
      where: { id: approval.id, decision: "pending" },
      data: { decision, decisionNotes, decidedAt: new Date() },
    });
    if (claimed.count !== 1) {
      return NextResponse.json({ error: ALREADY_HANDLED }, { status: 409 });
    }
    await db.case.update({ where: { id: caseId }, data: { status: "closed" } });
    await db.caseEvent.create({
      data: { caseId, type: "approval", message: "You chose not to pursue this recommendation." },
    });
    await writeAuditLog({ userId: user.id, action: "approval.decide", resource: `case:${caseId}`, ip, metadata: { decision } });
    return NextResponse.json({ ok: true });
  }

  // decision === "approved"
  const finalBody = editedBody ?? communication.body;
  const finalSubject = communication.subject ?? "";
  if (containsUnfilledPlaceholder(finalBody) || containsUnfilledPlaceholder(finalSubject)) {
    return NextResponse.json(
      { error: "This message still has an unfilled placeholder (e.g. \"[INSERT ...]\"). Edit it to fill in the details before approving." },
      { status: 400 },
    );
  }
  // The shared demo account's password is public, so it must never cause a real email to go out,
  // whatever the provider configuration is: it always takes the simulated path.
  const demoAccount = isDemoEmail(user.email);
  const realSend = isEmailConfigured() && !demoAccount;
  // Real emails go out with the user's address as Reply-To, so the address must be verified first
  // (otherwise anyone could register with a victim's address and send mail as them).
  if (realSend) {
    const account = await db.user.findUnique({ where: { id: user.id }, select: { emailVerifiedAt: true } });
    if (!account?.emailVerifiedAt) {
      return NextResponse.json(
        { error: "Verify your email address before sending. Use the banner at the top of the page to resend the link." },
        { status: 403 },
      );
    }
  }
  if (!recipientEmail) {
    return NextResponse.json(
      { error: "Enter the merchant's contact email before approving — Redress never guesses or invents one." },
      { status: 400 },
    );
  }

  // Atomic claim: exactly one request can move this approval out of "pending".
  const claimed = await db.userApproval.updateMany({
    where: { id: approval.id, decision: "pending" },
    data: { decision: "sending" },
  });
  if (claimed.count !== 1) {
    return NextResponse.json({ error: ALREADY_HANDLED }, { status: 409 });
  }

  if (editedBody && editedBody !== communication.body) {
    await db.communication.update({ where: { id: communication.id }, data: { body: editedBody, draftedBy: "user" } });
  }

  const sendResult: Awaited<ReturnType<typeof sendClaimEmail>> = realSend
    ? await sendClaimEmail({ to: recipientEmail, subject: finalSubject, body: finalBody, replyTo: user.email })
    : { ok: false, error: "EMAIL_NOT_CONFIGURED" };

  if (!sendResult.ok && sendResult.error !== "EMAIL_NOT_CONFIGURED") {
    // A failed send must never look like a submission: release the claim so the user can fix the
    // address or retry after a transient provider error.
    await db.userApproval.updateMany({ where: { id: approval.id, decision: "sending" }, data: { decision: "pending" } });
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

  const simulated = !sendResult.ok;
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
      message: !simulated
        ? `You approved the request. It was sent to ${recipientEmail}.`
        : demoAccount
          ? `You approved the request. (Simulated submission to ${recipientEmail} — the shared demo account never sends real email.)`
          : `You approved the request. (Simulated submission to ${recipientEmail} — no email provider is connected in this environment.)`,
      metadata: sendResult.ok ? JSON.stringify({ providerMessageId: sendResult.providerMessageId }) : JSON.stringify({ simulated: true }),
    },
  });

  await writeAuditLog({
    userId: user.id,
    action: "approval.decide",
    resource: `case:${caseId}`,
    ip,
    metadata: { decision, simulated },
  });

  return NextResponse.json({ ok: true, simulated });
}
