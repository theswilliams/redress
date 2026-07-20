"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OUTCOME_TYPES, OUTCOME_TYPE_LABELS, type OutcomeType } from "@/lib/types";

export function OutcomePanel({ caseId, status }: { caseId: string; status: string }) {
  const router = useRouter();
  const [recording, setRecording] = useState(false);
  const [outcomeType, setOutcomeType] = useState<OutcomeType>("refund");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function post(body: Record<string, unknown>, loadingKey: string) {
    setError(null);
    setLoading(loadingKey);
    try {
      const res = await fetch(`/api/cases/${caseId}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setLoading(null);
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(null);
    }
  }

  async function submitOutcome() {
    const dollars = outcomeType === "no_recovery" ? 0 : Number(amount);
    if (outcomeType !== "no_recovery" && (!amount || Number.isNaN(dollars) || dollars < 0)) {
      setError("Enter a valid recovered amount.");
      return;
    }
    await post(
      { action: "record_outcome", outcomeType, recoveredCents: Math.round(dollars * 100), notes: notes || undefined },
      "outcome",
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">What happened?</h2>
      <p className="mt-1 text-sm text-muted">
        Once the merchant responds (or you hear nothing), record the outcome here to keep your dashboard accurate.
      </p>

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {recording ? (
        <div className="mt-4 flex flex-col gap-3">
          <div>
            <label htmlFor="outcomeType" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
              Outcome
            </label>
            <select
              id="outcomeType"
              value={outcomeType}
              onChange={(e) => setOutcomeType(e.target.value as OutcomeType)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
            >
              {OUTCOME_TYPES.map((type) => (
                <option key={type} value={type}>
                  {OUTCOME_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          {outcomeType !== "no_recovery" && (
            <div>
              <label htmlFor="amount" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                Amount recovered (USD)
              </label>
              <input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>
          )}

          <div>
            <label htmlFor="notes" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
              Notes <span className="font-normal normal-case text-muted">(optional)</span>
            </label>
            <textarea
              id="notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={submitOutcome}
              disabled={loading !== null}
              className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {loading === "outcome" ? "Saving…" : "Save outcome"}
            </button>
            <button
              onClick={() => setRecording(false)}
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:border-brand/40"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => setRecording(true)}
            className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Record outcome
          </button>
          {status === "submitted" && (
            <button
              onClick={() => post({ action: "mark_waiting" }, "waiting")}
              disabled={loading !== null}
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:border-brand/40 disabled:opacity-60"
            >
              {loading === "waiting" ? "Saving…" : "Still waiting on a response"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
