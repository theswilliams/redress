import Link from "next/link";
import { db } from "@/lib/db";

async function verify(token: string | undefined) {
  if (!token) return { ok: false as const, message: "This verification link is missing a token." };

  const record = await db.emailVerificationToken.findUnique({ where: { token } });
  if (!record) return { ok: false as const, message: "This verification link is invalid." };
  if (record.usedAt) return { ok: true as const, message: "Your email is already verified." };
  if (record.expiresAt < new Date()) {
    return { ok: false as const, message: "This verification link has expired. Request a new one from your account settings." };
  }

  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
    db.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);

  return { ok: true as const, message: "Your email is verified." };
}

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const result = await verify(token);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16 text-center sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">{result.ok ? "Email verified" : "Verification failed"}</h1>
      <p className={`mt-3 text-sm ${result.ok ? "text-foreground/80" : "text-red-600 dark:text-red-400"}`}>
        {result.message}
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-block rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
      >
        Go to dashboard
      </Link>
    </div>
  );
}
