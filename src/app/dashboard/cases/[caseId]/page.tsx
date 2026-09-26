import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatCents, formatDateTime } from "@/lib/format";
import {
  CASE_TYPE_LABELS,
  CERTAINTY_LABELS,
  OUTCOME_TYPE_LABELS,
  RECORDABLE_OUTCOME_STATUSES,
  type CaseStatus,
  type CaseType,
  type CertaintyLevel,
  type OutcomeType,
} from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";
import { isDemoEmail } from "@/lib/demo";
import { ApprovalPanel } from "./approval-panel";
import { OutcomePanel } from "./outcome-panel";

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
      analyses: {
        where: { agent: "claim_drafting" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { flaggedForReview: true, flagReason: true },
      },
    },
  });

  if (!caseRecord || caseRecord.userId !== user.id) {
    notFound();
  }

  const pendingApproval = caseRecord.approvals.find((a) => a.decision === "pending");
  const sendingApproval = caseRecord.approvals.find((a) => a.decision === "sending");
  const proposed = pendingApproval ? readProposedAction(pendingApproval.proposedAction) : null;
  const pendingCommunication = proposed
    ? caseRecord.communications.find((c) => c.id === proposed.communicationId)
    : undefined;
  const latestDraftCheck = caseRecord.analyses[0];
  const draftWarnings =
    latestDraftCheck?.flaggedForReview && latestDraftCheck.flagReason ? latestDraftCheck.flagReason.split("; ") : [];

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

      {sendingApproval && (
        <p role="status" className="rounded-xl border border-border bg-card p-4 text-sm">
          Your approved message is being sent. Refresh in a moment to see the result.
        </p>
      )}

      {pendingApproval && pendingCommunication && proposed && (
        <ApprovalPanel
          caseId={caseRecord.id}
          subject={pendingCommunication.subject ?? ""}
          body={pendingCommunication.body}
          summary={proposed.summary}
          isDemo={isDemoEmail(user.email)}
          warnings={draftWarnings}
          initialRecipientEmail={pendingCommunication.recipientEmail}
          sendError={
            pendingCommunication.status === "send_failed" ? pendingCommunication.sendError : null
          }
        />
      )}

      {RECORDABLE_OUTCOME_STATUSES.includes(caseRecord.status as CaseStatus) && (
        <OutcomePanel caseId={caseRecord.id} status={caseRecord.status} />
      )}

      {caseRecord.outcomes.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Outcome</h2>
          <div className="flex flex-col gap-3">
            {caseRecord.outcomes.map((outcome) => (
              <div key={outcome.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{OUTCOME_TYPE_LABELS[outcome.outcomeType as OutcomeType]}</p>
                  <p className="font-semibold">{formatCents(outcome.recoveredCents)}</p>
                </div>
                {outcome.notes && <p className="mt-1 text-sm text-foreground/80">{outcome.notes}</p>}
                <p className="mt-1 text-xs text-muted">{formatDateTime(outcome.resolvedAt)}</p>
              </div>
            ))}
          </div>
        </section>
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
            These come from the AI model&apos;s general knowledge. Redress doesn&apos;t look up the merchant&apos;s
            current policy or the law, so treat them as leads to verify, not facts or legal advice.
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
              aria-label={`Open ${doc.fileName} in a new tab`}
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

function readProposedAction(json: string): { communicationId: string; summary: string } | null {
  try {
    const parsed = JSON.parse(json) as { communicationId?: unknown; summary?: unknown };
    if (typeof parsed.communicationId !== "string") return null;
    return { communicationId: parsed.communicationId, summary: typeof parsed.summary === "string" ? parsed.summary : "" };
  } catch {
    return null;
  }
}
