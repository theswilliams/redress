import { CASE_STATUS_LABELS, type CaseStatus } from "@/lib/types";

const STATUS_STYLES: Record<CaseStatus, string> = {
  analysis_in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  information_needed: "bg-amber-50 text-amber-700 border-amber-200",
  ready_for_review: "bg-blue-50 text-blue-700 border-blue-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  submitted: "bg-indigo-50 text-indigo-700 border-indigo-200",
  awaiting_response: "bg-indigo-50 text-indigo-700 border-indigo-200",
  additional_information_requested: "bg-amber-50 text-amber-700 border-amber-200",
  resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  closed: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

export function StatusBadge({ status }: { status: CaseStatus }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[status]}`}>
      {CASE_STATUS_LABELS[status]}
    </span>
  );
}
