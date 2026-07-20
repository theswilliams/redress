"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { containsUnfilledPlaceholder } from "@/lib/ai/safetyLayer";

export function ApprovalPanel({
  caseId,
  subject,
  body,
  summary,
}: {
  caseId: string;
  subject: string;
  body: string;
  summary: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);
  const [note, setNote] = useState("");
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasPlaceholder = containsUnfilledPlaceholder(draft) || containsUnfilledPlaceholder(subject);

  async function submitDecision(decision: "approved" | "rejected" | "edited") {
    setError(null);
    setLoading(decision);
    try {
      const res = await fetch(`/api/cases/${caseId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, editedBody: decision !== "rejected" ? draft : undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setLoading(null);
        return;
      }
      if (decision === "edited") {
        setEditing(false);
        setLoading(null);
        router.refresh();
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(null);
    }
  }

  async function submitNote() {
    if (!note.trim()) return;
    setLoading("note");
    await fetch(`/api/cases/${caseId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    setNote("");
    setShowNoteForm(false);
    setLoading(null);
    router.refresh();
  }

  return (
    <section className="rounded-2xl border border-brand/30 bg-brand-light/40 p-5">
      <h2 className="text-lg font-semibold text-brand-dark">Review before Redress sends this</h2>
      <p className="mt-1 text-sm text-foreground/80">{summary}</p>

      <div className="mt-4 rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Subject</p>
        <p className="mb-3 text-sm font-medium">{subject}</p>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Message</p>
        {editing ? (
          <textarea
            rows={8}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
          />
        ) : (
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">{draft}</p>
        )}
      </div>

      {hasPlaceholder && !editing && (
        <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
          This message still has an unfilled placeholder (shown in brackets) — edit it to fill in the details before
          you can approve and submit.
        </p>
      )}

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {editing ? (
          <>
            <button
              onClick={() => submitDecision("edited")}
              disabled={loading !== null}
              className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {loading === "edited" ? "Saving…" : "Save edit"}
            </button>
            <button
              onClick={() => {
                setDraft(body);
                setEditing(false);
              }}
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:border-brand/40"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => submitDecision("approved")}
              disabled={loading !== null || hasPlaceholder}
              title={hasPlaceholder ? "Edit the message to remove the placeholder before approving" : undefined}
              className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {loading === "approved" ? "Submitting…" : "Approve & Submit"}
            </button>
            <button
              onClick={() => setEditing(true)}
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:border-brand/40"
            >
              Edit Message
            </button>
            <button
              onClick={() => setShowNoteForm((v) => !v)}
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:border-brand/40"
            >
              Add More Information
            </button>
            <button
              onClick={() => submitDecision("rejected")}
              disabled={loading !== null}
              className="rounded-full px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950"
            >
              {loading === "rejected" ? "Saving…" : "Reject Recommendation"}
            </button>
          </>
        )}
      </div>

      {showNoteForm && (
        <div className="mt-4 rounded-xl border border-border bg-card p-4">
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add any extra context that might help — Redress will factor it in."
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button
            onClick={submitNote}
            disabled={loading !== null}
            className="mt-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {loading === "note" ? "Saving…" : "Add note"}
          </button>
        </div>
      )}
    </section>
  );
}
