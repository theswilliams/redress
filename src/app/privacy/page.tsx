import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy — Redress" };

export default function PrivacyPage() {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 text-sm leading-6 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Privacy</h1>
      <p className="mt-2 text-muted">
        Redress is a personal portfolio project, not a commercial service. This page describes what the running app
        actually does with your information.
      </p>

      <Section title="Don't upload sensitive documents">
        Redress works with receipts and bills, which can contain your name, address and part of a card number. It has
        not been audited for handling real personal or financial data. Use made-up or redacted documents, and never
        upload anything to the shared demo account that you wouldn&apos;t want strangers to see.
      </Section>

      <Section title="What is stored">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Account:</strong> your name, email address, a bcrypt hash of your password (never the password
            itself) and whether your email is verified.
          </li>
          <li>
            <strong>Documents you upload:</strong> the file, stored privately (Vercel Blob in the hosted app). It is
            only served to the signed-in account that uploaded it, through an ownership check; its storage address is
            never given to the browser.
          </li>
          <li>
            <strong>Case data:</strong> the facts extracted from your document, each AI stage&apos;s output, drafted
            messages, notes you add, the recipient address you enter, outcomes you record and a timeline of events.
          </li>
          <li>
            <strong>Security records:</strong> an audit log of security-relevant actions (for example sign-up,
            approvals, password resets) including the IP address the request came from, and short-lived rate-limit
            counters keyed by IP address or account.
          </li>
          <li>
            <strong>In your browser:</strong> a sign-in session cookie, and your light/dark theme choice in local
            storage. There are no analytics, advertising or tracking scripts.
          </li>
        </ul>
      </Section>

      <Section title="Who else receives it">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Google (Gemini API):</strong> when you create a case, your uploaded file and the description you
            type are sent to Google&apos;s Gemini API for analysis, along with the extracted facts for the later
            stages. Google&apos;s API terms apply to that data; depending on the API tier in use, they may allow
            Google to use submitted content to improve its services.
          </li>
          <li>
            <strong>Resend (email):</strong> account emails (verification, password reset) go through Resend. If you
            approve a message and real sending is enabled, the message, the recipient you entered and your email
            address (as the reply-to) go through Resend to the merchant.
          </li>
          <li>
            <strong>Hosting:</strong> the app runs on Vercel, with a Postgres database (Neon) and Upstash Redis for
            rate limiting.
          </li>
        </ul>
        <p className="mt-2">Nothing is sold or shared for marketing.</p>
      </Section>

      <Section title="The shared demo account">
        Everyone who signs in to the demo account sees the same cases, including anything another visitor uploaded.
        Its example cases and documents are synthetic. The account is reset once a day, which deletes every case,
        document and uploaded file on it. Approving a message on the demo account never sends an email.
      </Section>

      <Section title="Keeping and deleting data">
        Your data is kept until you delete your account. Deleting it (Settings → Delete my account) removes your
        account, cases, drafts and uploaded files. Audit log entries are kept with the link to your account removed.
        There is no other automatic expiry.
      </Section>

      <Section title="Contact">
        Questions or a security report: <a className="underline" href="mailto:sw.probably.works@gmail.com">sw.probably.works@gmail.com</a>.
        See also the <Link className="underline" href="/terms">terms of use</Link>.
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <div className="text-foreground/85">{children}</div>
    </section>
  );
}
