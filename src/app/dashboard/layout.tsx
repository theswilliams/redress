import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { isDemoEmail } from "@/lib/demo";
import { VerifyEmailBanner } from "@/components/verify-email-banner";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/cases", label: "Cases" },
  { href: "/dashboard/upload", label: "New case" },
  { href: "/dashboard/settings", label: "Settings" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const dbUser = await db.user.findUnique({ where: { id: user.id }, select: { emailVerifiedAt: true } });
  const isDemo = isDemoEmail(user.email);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:flex-row sm:gap-8 sm:px-6">
      <aside className="shrink-0 sm:w-48">
        <nav aria-label="Dashboard" className="flex gap-1 overflow-x-auto sm:sticky sm:top-24 sm:flex-col">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-brand-light hover:text-brand-dark"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1">
        {isDemo && (
          <p
            role="note"
            className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
          >
            <span className="font-semibold">Shared demo account.</span> Everyone who signs in sees the same cases, it
            resets daily, and approving a message only simulates sending — no email goes out. Don&apos;t upload real
            documents.
          </p>
        )}
        {dbUser && !dbUser.emailVerifiedAt && <VerifyEmailBanner />}
        {children}
      </main>
    </div>
  );
}
