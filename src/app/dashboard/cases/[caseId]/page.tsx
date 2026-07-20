import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatCents, formatDateTime } from "@/lib/format";
import { CASE_TYPE_LABELS, CERTAINTY_LABELS, type CaseStatus, type CaseType, type CertaintyLevel } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";
import { ApprovalPanel } from "./approval-panel";

export default async function CaseDetailPage({ params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireUser();
  const { caseId } = await params;

  const caseRecord = await db.case.findUnique({
    where: { id: caseId },
    include: {
      documents: true,
      transactions: true,
      communications: { orderBy: { createdAt: "desc" } },
      events: { orderBy: { createdAt: "asc" } },
      approvals: { orderBy: { createdAt: "desc" } },
      outcomes: true,
      policySources: true,
    },
  });

  if (!caseRecord || caseRecord.userId !== user.id) {
    notFound();
  }

  const pendingApproval = caseRecord.approvals.find((a) => a.decision === "pending");
  const pendingCommunication = pendingApproval
    ? caseRecord.communications.find(
        (c) => c.id === (JSON.parse(pendingApproval.proposedAction) as { communicationId: string }).communicationId,
      )
    : undefined;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{CASE_TYPE_LABELS[caseRecord.caseType as CaseType]}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{caseRecord.merchant ?? "Analyzing your document…"}</h1>
        </div>
        <StatusBadge status={caseRecord.status as CaseStatus} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Original amount" value={formatCents(caseRecord.originalAmountCents)} />
        <Stat label="Potentially recoverable" value={formatCents(caseRecord.potentialRecoveryCents)} />
        <Stat label="Confidence" value={caseRecord.confidenceLevel} className="capitalize" />
        <Stat label="Recovered so far" value={formatCents(caseRecord.confirmedRecoveryCents)} />
      </div>

      {caseRecord.requiredAction && (
        <div className="rounded-xl border border-border bg-brand-light/50 p-4">
          <p className="text-sm font-semibold text-brand-dark">Next step</p>
          <p className="mt-1 text-sm text-foreground/80">{caseRecord.requiredAction}</p>
        </div>
      )}

      {pendingApproval && pendingCommunication && (
        <ApprovalPanel
          caseId={caseRecord.id}
          subject={pendingCommunication.subject ?? ""}
          body={pendingCommunication.body}
          summary={(JSON.parse(pendingApproval.proposedAction) as { summary: string }).summary}
          initialRecipientEmail={pendingCommunication.recipientEmail}
          sendError={
            pendingCommunication.status === "send_failed" ? pendingCommunication.sendError : null
          }
        />
      )}

      {caseRecord.policySources.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Policy research</h2>
          <div className="flex flex-col gap-3">
            {caseRecord.policySources.map((source) => (
              <div key={source.id} className="rounded-xl border border-border bg-card p-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold capitalize">{source.policyType.replace(/_/g, " ")}</p>
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                    {CERTAINTY_LABELS[source.certainty as CertaintyLevel]}
                  </span>
                </div>
                <p className="text-sm text-foreground/80">{source.excerpt}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            General information based on Redress&apos;s knowledge, not verified legal advice or a live check of the
            merchant&apos;s current policy.
          </p>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Documents</h2>
        <div className="flex flex-col gap-2">
          {caseRecord.documents.map((doc) => (
            <a
              key={doc.id}
              href={`/api/documents/${doc.id}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm hover:border-brand/40"
            >
              <span>{doc.fileName}</span>
              <span className="text-muted">{formatDateTime(doc.createdAt)}</span>
            </a>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Timeline</h2>
        <ol className="flex flex-col gap-3 border-l border-border pl-4">
          {caseRecord.events.map((event) => (
            <li key={event.id}>
              <p className="text-sm">{event.message}</p>
              <p className="text-xs text-muted">{formatDateTime(event.createdAt)}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${className ?? ""}`}>{value}</p>
    </div>
  );
}
