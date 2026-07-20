import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getBillingConfig, formatSuccessFeeCopy } from "@/lib/billing/config";
import { formatCents, formatDate } from "@/lib/format";
import { DangerZone } from "@/components/danger-zone";

export default async function SettingsPage() {
  const currentUser = await requireUser();
  const user = await db.user.findUniqueOrThrow({ where: { id: currentUser.id } });
  const payments = await db.payment.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  const billing = getBillingConfig();

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
        <p className="text-sm text-foreground/80">{formatSuccessFeeCopy()}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {Object.entries(billing.plans).map(([key, plan]) => (
            <div key={key} className="rounded-xl border border-border p-4">
              <p className="font-semibold">{plan.label}</p>
              <p className="text-sm text-muted">{plan.description}</p>
              <p className="mt-2 text-sm font-medium">
                {plan.priceCents === 0 ? "Free" : `${formatCents(plan.priceCents)}/${plan.interval}`}
              </p>
            </div>
          ))}
        </div>

        {payments.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-sm font-semibold">Payment history</p>
            <div className="flex flex-col gap-2">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="capitalize">{p.kind.replace(/_/g, " ")}</span>
                  <span>{formatCents(p.amountCents)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <DangerZone />
    </div>
  );
}
