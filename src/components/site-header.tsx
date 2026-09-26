"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  const { status } = useSession();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="Redress home" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
            R
          </span>
          <span className="hidden min-[400px]:inline">Redress</span>
        </Link>

        <nav className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          {status === "authenticated" ? (
            <>
              <Link
                href="/dashboard"
                className="hidden text-sm font-medium text-foreground/80 hover:text-foreground sm:inline"
              >
                Dashboard
              </Link>
              <Link
                href="/dashboard/upload"
                className="whitespace-nowrap rounded-full bg-brand px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark sm:px-4"
              >
                Find My Money
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="whitespace-nowrap text-sm font-medium text-muted hover:text-foreground"
              >
                Sign out
              </button>
            </>
          ) : status === "loading" ? (
            <div className="h-9 w-24 animate-pulse rounded-full bg-border" />
          ) : (
            <>
              <Link href="/signin" className="whitespace-nowrap text-sm font-medium text-foreground/80 hover:text-foreground">
                Sign in
              </Link>
              <Link
                href="/signup"
                className="whitespace-nowrap rounded-full bg-brand px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark sm:px-4"
              >
                Find My Money
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
