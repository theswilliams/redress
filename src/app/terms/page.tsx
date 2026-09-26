import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms — Redress" };

const TERMS: { title: string; body: React.ReactNode }[] = [
  {
    title: "What Redress is",
    body: "An AI-assisted tool that reads a receipt or bill, suggests what you might be able to ask a merchant for, and drafts a message for you to review. It is a personal portfolio project offered as a demo, with no fees and no service commitment. It may change, reset or go offline at any time.",
  },
  {
    title: "Not legal advice",
    body: "Redress is not a law firm and does not give legal advice. Its analysis comes from an AI model that can be incomplete or wrong, and it does not check merchants' current policies or the law. Verify anything important yourself, and consult a qualified professional for legal questions.",
  },
  {
    title: "No guaranteed outcome",
    body: "Nothing Redress suggests guarantees a refund, credit or any other result. Whether a merchant agrees is up to them.",
  },
  {
    title: "You review and send",
    body: "Redress never contacts anyone without your explicit approval. You are responsible for reading every message before you approve it, for its accuracy, and for the recipient address you enter.",
  },
  {
    title: "Your documents",
    body: "Only upload documents you own or are authorized to use. Don't upload other people's personal information, and don't upload anything sensitive to the shared demo account, which every visitor can see.",
  },
  {
    title: "Acceptable use",
    body: "Don't use Redress to send spam, harass or threaten anyone, impersonate someone, make false claims, or send messages to people who haven't dealt with you. Don't attempt to break, overload or get around the app's limits or security. Accounts used this way may be removed.",
  },
];

export default function TermsPage() {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 text-sm leading-6 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Terms of use</h1>
      {TERMS.map((t) => (
        <section key={t.title} className="mt-8">
          <h2 className="mb-2 text-lg font-semibold">{t.title}</h2>
          <p className="text-foreground/85">{t.body}</p>
        </section>
      ))}
      <p className="mt-10 text-muted">
        See also <Link className="underline" href="/privacy">how your information is handled</Link>.
      </p>
    </article>
  );
}
