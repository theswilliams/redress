"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  MAX_UPLOAD_SIZE_BYTES,
  MAX_UPLOAD_SIZE_LABEL,
  PROBLEM_CATEGORIES,
  PROBLEM_CATEGORY_LABELS,
  type ProblemCategory,
} from "@/lib/types";
import { isDemoEmail } from "@/lib/demo";
import { useSession } from "next-auth/react";

export default function UploadPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const isDemo = isDemoEmail(session?.user?.email);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [problemCategory, setProblemCategory] = useState<ProblemCategory | null>(null);
  const [context, setContext] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const file = fileInputRef.current?.files?.[0];
    if (!problemCategory) {
      setError("Choose the problem you're trying to solve.");
      return;
    }
    if (!file) {
      setError("Upload a document to continue.");
      return;
    }
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      setError(`That file is too large. The limit is ${MAX_UPLOAD_SIZE_LABEL}.`);
      return;
    }

    setLoading(true);

    const formData = new FormData();
    formData.set("problemCategory", problemCategory);
    formData.set("userStatedProblem", context);
    formData.set("file", file);

    try {
      const res = await fetch("/api/cases", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setLoading(false);
        return;
      }
      router.push(`/dashboard/cases/${data.caseId}`);
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">What problem are you trying to solve?</h1>
        <p className="mt-1 text-sm text-muted">Pick the closest match — Redress will confirm the details.</p>
      </div>

      {isDemo && (
        <div role="note" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-semibold">You&apos;re on the shared demo account.</p>
          <p className="mt-1">
            Every visitor can see what you upload here, and it&apos;s deleted in the daily reset. Don&apos;t upload
            real receipts or anything with personal information — use a made-up or redacted document.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-8">
        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Problem type">
          {PROBLEM_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              aria-pressed={problemCategory === category}
              onClick={() => setProblemCategory(category)}
              className={`rounded-xl border p-4 text-left text-sm font-medium transition ${
                problemCategory === category
                  ? "border-brand bg-brand-light text-brand-dark"
                  : "border-border bg-card hover:border-brand/40"
              }`}
            >
              {PROBLEM_CATEGORY_LABELS[category]}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor="context" className="mb-1 block text-sm font-medium">
            Anything else we should know? <span className="font-normal text-muted">(optional)</span>
          </label>
          <textarea
            id="context"
            rows={4}
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="e.g. Purchased headphones for $249.99. They went on sale for $199.99 two weeks later."
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>

        <div>
          <p className="mb-1 block text-sm font-medium">Upload your document</p>
          <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/30">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              className="sr-only"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer text-sm">
              {fileName ? (
                <span className="font-medium text-brand-dark">{fileName}</span>
              ) : (
                <>
                  <span className="font-semibold text-brand">Choose a file</span>{" "}
                  <span className="text-muted">— PDF, PNG, JPEG, or WEBP, up to {MAX_UPLOAD_SIZE_LABEL}</span>
                </>
              )}
            </label>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          {loading ? "Analyzing your document…" : "Analyze my document"}
        </button>
        <p className="text-xs text-muted">
          Your document is sent to Google&apos;s Gemini API for analysis. Redress gives general information, not
          legal advice, and the result can be wrong — you review everything before anything is sent. See{" "}
          <a href="/privacy" className="underline hover:text-foreground">Privacy</a>.
        </p>
      </form>
    </div>
  );
}
