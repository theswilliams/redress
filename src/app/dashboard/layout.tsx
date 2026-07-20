import Link from "next/link";
import { requireUser } from "@/lib/session";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/cases", label: "Cases" },
  { href: "/dashboard/upload", label: "New case" },
  { href: "/dashboard/settings", label: "Settings" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireUser();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 gap-8 px-4 py-8 sm:px-6">
      <aside className="hidden w-48 shrink-0 sm:block">
        <nav className="sticky top-24 flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-brand-light hover:text-brand-dark"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
