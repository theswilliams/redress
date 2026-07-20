# Redress

AI-powered consumer advocacy platform. Upload a receipt, bill, or customer-service problem — Redress figures out what you may be entitled to and helps you get it back, with you approving every external action.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind
- Prisma 7 (SQLite locally via `@prisma/adapter-better-sqlite3`; swap the datasource provider for Postgres in production)
- Auth.js (NextAuth v5) credentials provider, bcrypt password hashing, JWT sessions
- Google Gemini API for the AI agent pipeline (document analysis, opportunity detection, policy research, claim drafting)
- Resend for sending approved claim emails
- Local filesystem object storage behind an abstraction (`src/lib/storage.ts`) — swappable for S3
- DB-backed job queue (`Job` model) for the analysis pipeline — swappable for a real queue (BullMQ/SQS/etc)
- Vitest for unit tests

## Getting started

```bash
npm install
npx prisma migrate dev   # creates dev.db and applies the schema
npm run dev
```

Copy `.env.example` to `.env` and fill in `GEMINI_API_KEY` to enable real AI analysis (free tier, no card required — get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)). Without a key, the app runs in **demo mode**: uploads and the full case workflow still work, but every AI agent returns a clearly-labeled placeholder instead of a real analysis.

Fill in `RESEND_API_KEY` to enable real email delivery (free tier, no card required — get one at [resend.com/api-keys](https://resend.com/api-keys)). Without a key, an approved submission is simulated (clearly labeled as such) instead of actually sent. Note: until you [verify a custom domain](https://resend.com/docs/dashboard/domains/introduction) with Resend and set `EMAIL_FROM` to an address on it, the default sandbox sender can only deliver to the email address of the Resend account owner — not to arbitrary merchants.

## Tests

```bash
npm test
```

## Architecture notes

- **Human approval gate**: no external communication is ever created with a status other than `draft`. Sending only happens after an explicit `UserApproval` record with `decision: "approved"` — enforced in `app/api/cases/[caseId]/approve/route.ts`, not by the AI.
- **Prompt-injection defense**: uploaded documents are untrusted input. Every agent's system prompt (`src/lib/ai/prompts.ts`) instructs the model to treat document content as data, never instructions — and the approval gate above means this holds even if that instruction were ignored.
- **Fact vs. inference**: extracted fields carry a `confidence` and `uncertain` flag; policy research findings carry an explicit `certainty` level (`confirmed_policy` / `likely_possibility` / `user_specific_assumption` / `unknown`). The UI surfaces these distinctions rather than presenting everything as fact.
- **Billing**: the success-fee percentage and plan list are config-driven (`src/lib/billing/config.ts`, `REDRESS_SUCCESS_FEE_PERCENT` env var), not hard-coded, so the business model can change without a schema rewrite.
- **Email delivery**: sending is real (via Resend, `src/lib/email/send.ts`) once `RESEND_API_KEY` is configured — otherwise it falls back to a clearly-labeled simulated send. The recipient address is always supplied by the user in the approval UI; Redress never guesses or fabricates a merchant's contact email. If a send fails (bad address, provider error), the approval stays pending and the error is surfaced so the user can fix it and retry — nothing is silently marked as sent.
