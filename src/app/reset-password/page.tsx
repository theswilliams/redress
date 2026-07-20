"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

export default function ResetPasswordRequestPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);

    const res = await fetch("/api/password-reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));

    setLoading(false);
    setSubmitted(true);
    if (data.devResetUrl) setDevResetUrl(data.devResetUrl);
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1 text-sm text-muted">We&apos;ll send a reset link to your email.</p>

      {submitted ? (
        <div className="mt-8 rounded-xl border border-border bg-card p-5 text-sm">
          <p>If an account exists for that email, a reset link has been sent.</p>
          {devResetUrl && (
            <p className="mt-3 rounded-lg bg-brand-light p-3 text-xs text-brand-dark">
              Dev mode (no email provider configured):{" "}
              <Link href={devResetUrl} className="font-semibold underline">
                Open your reset link
              </Link>
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/signin" className="font-medium text-brand hover:text-brand-dark">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
