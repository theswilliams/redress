import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatCents } from "@/lib/format";
import { CASE_STATUS_LABELS, type CaseStatus } from "@/lib/types";

const ACTIVE_STATUSES: CaseStatus[] = [
  "analysis_in_progress",
  "information_needed",
  "ready_for_review",
  "approved",
  "submitted",
  "awaiting_response",
  "additional_information_requested",
];

export default async function DashboardOverviewPage() {
  const user = await requireUser();

  const [cases, outcomes] = await Promise.all([
    db.case.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    db.recoveryOutcome.findMany({ where: { case: { userId: user.id } } }),
  ]);

  const totalRecoveredCents = outcomes.reduce((sum, o) => sum + o.recoveredCents, 0);
  const potentiallyRecoverableCents = cases
    .filter((c) => ACTIVE_STATUSES.includes(c.status as CaseStatus))
    .reduce((sum, c) => sum + (c.potentialRecoveryCents ?? 0), 0);
  const activeCases = cases.filter((c) => ACTIVE_STATUSES.includes(c.status as CaseStatus)).length;
  const resolvedCases = cases.filter((c) => c.status === "resolved" || c.status === "rejected").length;
  const successfulCases = cases.filter((c) => c.status === "resolved").length;
  const successRate = resolvedCases > 0 ? `${Math.round((successfulCases / resolvedCases) * 100)}%` : "Not enough data";

  const stats = [
    { label: "Total recovered", value: formatCents(totalRecoveredCents) },
    { label: "Potentially recoverable", value: formatCents(potentiallyRecoverableCents) },
    { label: "Active cases", value: String(activeCases) },
    { label: "Success rate", value: successRate },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back{user.name ? `, ${user.name}` : ""}</h1>
          <p className="mt-1 text-sm text-muted">Here&apos;s where things stand across all your cases.</p>
        </div>
        <Link
          href="/dashboard/upload"
          className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
        >
          Find My Money
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm text-muted">{stat.label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{stat.value}</p>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent cases</h2>
          <Link href="/dashboard/cases" className="text-sm font-medium text-brand hover:text-brand-dark">
            View all
          </Link>
        </div>

        {cases.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <p className="text-muted">No cases yet. Upload something to see what you might be owed.</p>
            <Link
              href="/dashboard/upload"
              className="mt-4 inline-block rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
            >
              Find My Money
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {cases.slice(0, 5).map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/cases/${c.id}`}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4 transition hover:border-brand/40"
              >
                <div>
                  <p className="font-medium">{c.merchant ?? "Analyzing…"}</p>
                  <p className="text-sm text-muted">{CASE_STATUS_LABELS[c.status as CaseStatus]}</p>
                </div>
                <p className="font-semibold">{formatCents(c.potentialRecoveryCents)}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
