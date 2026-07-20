import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatCents, formatDate } from "@/lib/format";
import { CASE_STATUS_LABELS, CASE_TYPE_LABELS, type CaseStatus, type CaseType } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";

export default async function CasesPage() {
  const user = await requireUser();
  const cases = await db.case.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Your cases</h1>
        <Link
          href="/dashboard/upload"
          className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Find My Money
        </Link>
      </div>

      {cases.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-muted">
          No cases yet.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {cases.map((c) => (
            <Link
              key={c.id}
              href={`/dashboard/cases/${c.id}`}
              className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition hover:border-brand/40 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium">{c.merchant ?? "Analyzing…"}</p>
                <p className="text-sm text-muted">
                  {CASE_TYPE_LABELS[c.caseType as CaseType]} · Created {formatDate(c.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <StatusBadge status={c.status as CaseStatus} />
                <p className="w-24 text-right font-semibold">{formatCents(c.potentialRecoveryCents)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
