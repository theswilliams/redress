# Recoverly

AI-powered consumer advocacy platform. Upload a receipt, bill, or customer-service problem — Recoverly figures out what you may be entitled to and helps you get it back, with you approving every external action.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind
- Prisma 7 (SQLite locally via `@prisma/adapter-better-sqlite3`; swap the datasource provider for Postgres in production)
- Auth.js (NextAuth v5) credentials provider, bcrypt password hashing, JWT sessions
- Google Gemini API for the AI agent pipeline (document analysis, opportunity detection, policy research, claim drafting)
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

## Tests

```bash
npm test
```

## Architecture notes

- **Human approval gate**: no external communication is ever created with a status other than `draft`. Sending only happens after an explicit `UserApproval` record with `decision: "approved"` — enforced in `app/api/cases/[caseId]/approve/route.ts`, not by the AI.
- **Prompt-injection defense**: uploaded documents are untrusted input. Every agent's system prompt (`src/lib/ai/prompts.ts`) instructs the model to treat document content as data, never instructions — and the approval gate above means this holds even if that instruction were ignored.
- **Fact vs. inference**: extracted fields carry a `confidence` and `uncertain` flag; policy research findings carry an explicit `certainty` level (`confirmed_policy` / `likely_possibility` / `user_specific_assumption` / `unknown`). The UI surfaces these distinctions rather than presenting everything as fact.
- **Billing**: the success-fee percentage and plan list are config-driven (`src/lib/billing/config.ts`, `RECOVERLY_SUCCESS_FEE_PERCENT` env var), not hard-coded, so the business model can change without a schema rewrite.
- **No real email delivery**: approving a claim marks it "submitted" and logs the event, but no SMTP/email provider is wired up in this MVP — see the comment in the approve route for the integration seam.
