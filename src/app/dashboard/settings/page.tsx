import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatDate } from "@/lib/format";
import { DangerZone } from "@/components/danger-zone";

export default async function SettingsPage() {
  const currentUser = await requireUser();
  const user = await db.user.findUniqueOrThrow({ where: { id: currentUser.id } });

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account settings</h1>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 text-lg font-semibold">Profile</h2>
        <dl className="grid grid-cols-[100px_1fr] gap-y-2 text-sm">
          <dt className="text-muted">Name</dt>
          <dd>{user.name ?? "—"}</dd>
          <dt className="text-muted">Email</dt>
          <dd>
            {user.email}{" "}
            {user.emailVerifiedAt ? (
              <span className="text-xs font-semibold text-brand-dark">Verified</span>
            ) : (
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Not verified</span>
            )}
          </dd>
          <dt className="text-muted">Member since</dt>
          <dd>{formatDate(user.createdAt)}</dd>
        </dl>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 text-lg font-semibold">Billing</h2>
        <p className="text-sm text-foreground/80">
          Redress is a portfolio project: there are no plans, fees or payments, and nothing is ever charged.
        </p>
      </section>

      <DangerZone />
    </div>
  );
}
