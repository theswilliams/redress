"use client";

import { useState } from "react";

export function VerifyEmailBanner() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [devVerifyUrl, setDevVerifyUrl] = useState<string | null>(null);

  async function resend() {
    setStatus("sending");
    const res = await fetch("/api/verify-email/resend", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setStatus("sent");
    if (data.devVerifyUrl) setDevVerifyUrl(data.devVerifyUrl);
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950">
      <p className="text-amber-800 dark:text-amber-300">
        {status === "sent" ? "Verification email sent — check your inbox." : "Please verify your email address."}
      </p>
      {status !== "sent" && (
        <button
          onClick={resend}
          disabled={status === "sending"}
          className="rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900"
        >
          {status === "sending" ? "Sending…" : "Resend email"}
        </button>
      )}
      {devVerifyUrl && (
        <a href={devVerifyUrl} className="text-xs font-semibold text-amber-800 underline dark:text-amber-300">
          Dev: open verification link
        </a>
      )}
    </div>
  );
}
