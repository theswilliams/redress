"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

export function DangerZone() {
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteAccount() {
    setError(null);
    setLoading(true);
    const res = await fetch("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      setLoading(false);
      return;
    }
    await signOut({ callbackUrl: "/" });
  }

  return (
    <section className="rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-900 dark:bg-red-950/40">
      <h2 className="mb-1 text-lg font-semibold text-red-700 dark:text-red-400">Danger zone</h2>
      <p className="text-sm text-red-700/80 dark:text-red-300/80">
        Permanently delete your account, all cases, documents, and history. This can&apos;t be undone.
      </p>

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="mt-4 rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900"
        >
          Delete my account
        </button>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <div>
            <label htmlFor="confirmText" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
              Type DELETE to confirm
            </label>
            <input
              id="confirmText"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full rounded-lg border border-red-300 bg-card px-3 py-2 text-sm outline-none focus:border-red-500 dark:border-red-800"
            />
          </div>
          <div>
            <label htmlFor="deletePassword" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
              Confirm your password
            </label>
            <input
              id="deletePassword"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-red-300 bg-card px-3 py-2 text-sm outline-none focus:border-red-500 dark:border-red-800"
            />
          </div>

          {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={deleteAccount}
              disabled={confirmText !== "DELETE" || !password || loading}
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? "Deleting…" : "Permanently delete account"}
            </button>
            <button
              onClick={() => {
                setConfirming(false);
                setPassword("");
                setConfirmText("");
                setError(null);
              }}
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:border-brand/40"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
