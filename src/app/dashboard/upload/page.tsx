"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PROBLEM_CATEGORIES, PROBLEM_CATEGORY_LABELS, type ProblemCategory } from "@/lib/types";

export default function UploadPage() {
  const router = useRouter();
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
        <p className="mt-1 text-sm text-muted">Pick the closest match — Recoverly will confirm the details.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-8">
        <div className="grid gap-2 sm:grid-cols-2">
          {PROBLEM_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
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
          <label className="mb-1 block text-sm font-medium">Upload your document</label>
          <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer text-sm">
              {fileName ? (
                <span className="font-medium text-brand-dark">{fileName}</span>
              ) : (
                <>
                  <span className="font-semibold text-brand">Choose a file</span>{" "}
                  <span className="text-muted">or drag it here — PDF, PNG, JPEG, or WEBP, up to 15MB</span>
                </>
              )}
            </label>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          {loading ? "Analyzing your document…" : "Analyze my document"}
        </button>
      </form>
    </div>
  );
}
