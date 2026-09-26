import Link from "next/link";
import { DEMO_EMAIL, DEMO_PASSWORD_HINT } from "@/lib/demo";

const STEPS = [
  {
    title: "Upload your document",
    body: "A receipt, bill, order confirmation, warranty doc, or a screenshot of a customer-service chat — whatever you've got.",
  },
  {
    title: "AI analyzes your situation",
    body: "Redress reads the document and extracts the key facts, marking anything it isn't sure about.",
  },
  {
    title: "Redress finds possible opportunities",
    body: "A refund, a price adjustment, a billing correction, a cancellation you may be owed — with its reasoning and confidence.",
  },
  {
    title: "You review and approve the action",
    body: "Nothing is sent anywhere until you read the proposed message and explicitly approve it.",
  },
  {
    title: "You track the outcome",
    body: "Every case stays on your dashboard, and you record what the merchant said, from submitted to resolved.",
  },
];

const OPPORTUNITY_TYPES = [
  "Refund",
  "Partial refund",
  "Price adjustment",
  "Subscription cancellation",
  "Warranty claim",
  "Compensation",
  "Billing correction",
  "Return",
  "Service credit",
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      {/* Hero */}
      <section className="border-b border-border bg-gradient-to-b from-brand-light/70 to-background">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-4 py-20 text-center sm:px-6 sm:py-28">
          <span className="rounded-full border border-brand/20 bg-brand-light px-4 py-1 text-xs font-semibold uppercase tracking-wide text-brand-dark">
            AI-assisted consumer claims
          </span>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
            Your money is hiding in the fine print.
          </h1>
          <p className="max-w-2xl text-lg text-muted sm:text-xl">
            Upload a receipt, bill, or customer-service problem. Redress finds out what you may be entitled to and
            helps you get it back.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="rounded-full bg-brand px-7 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-brand-dark"
            >
              Find My Money
            </Link>
            <Link
              href="#how-it-works"
              className="rounded-full border border-border bg-card px-7 py-3 text-base font-semibold text-foreground transition hover:border-brand/40"
            >
              See How It Works
            </Link>
          </div>
        </div>
      </section>

      {/* Opportunity types */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <p className="text-center text-sm font-medium uppercase tracking-wide text-muted">
            Redress looks for opportunities like
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {OPPORTUNITY_TYPES.map((type) => (
              <span
                key={type}
                className="rounded-full border border-border bg-background px-3.5 py-1.5 text-sm text-foreground/80"
              >
                {type}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">How it works</h2>
          <p className="mt-3 text-muted">Five steps from &quot;I think I got overcharged&quot; to a message you&apos;ve checked and approved.</p>
        </div>
        <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((step, i) => (
            <li key={step.title} className="rounded-2xl border border-border bg-card p-6">
              <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-brand-light text-sm font-bold text-brand-dark">
                {i + 1}
              </div>
              <h3 className="mb-2 font-semibold">{step.title}</h3>
              <p className="text-sm text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Trust section */}
      <section className="border-y border-border bg-brand-light/40">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-20 sm:px-6 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">You stay in control</h2>
            <p className="mt-4 text-muted">
              Redress analyzes your documents and drafts recovery requests, but it never contacts a merchant on
              your behalf without your explicit approval. You always see exactly what Redress found, what it
              believes you may be entitled to, and the exact message it wants to send — before anything goes out.
            </p>
          </div>
          <div className="grid gap-4">
            {[
              {
                title: "Nothing sent without approval",
                body: "Every claim message is a draft until you click Approve & Submit.",
              },
              {
                title: "Fact from inference, always labeled",
                body: "Redress never presents a guess as a confirmed fact — every finding shows its confidence level.",
              },
              {
                title: "Not legal advice",
                body: "Redress is not a law firm. It gives general information, can be wrong, and never claims to be your attorney.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-border bg-card p-5">
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm text-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Try it */}
      <section className="mx-auto w-full max-w-4xl px-4 py-20 text-center sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Try the demo</h2>
        <p className="mx-auto mt-4 max-w-xl text-muted">
          Redress is a portfolio project, not a commercial service: there are no fees and no payments. Sign in to the
          shared demo account to see seeded example cases. Anything you approve there is simulated, and no email is
          sent.
        </p>
        <p className="mt-4 text-sm">
          <span className="text-muted">Email</span> <code className="font-mono">{DEMO_EMAIL}</code>{" "}
          <span className="ml-3 text-muted">Password</span> <code className="font-mono">{DEMO_PASSWORD_HINT}</code>
        </p>
        <Link
          href="/signin"
          className="mt-8 inline-block rounded-full bg-brand px-7 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-brand-dark"
        >
          Open the demo
        </Link>
      </section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-6xl px-4 text-center text-sm text-muted sm:px-6">
          <p>
            Redress provides general information, not legal advice, and takes no external action without your
            approval.
          </p>
          <p className="mt-2">
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <span aria-hidden="true"> · </span>
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
