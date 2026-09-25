import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserApi } from "@/lib/session";
import { newCaseSchema } from "@/lib/validation";
import { ALLOWED_UPLOAD_MIME_TYPES, DOCUMENT_STATUS, MAX_UPLOAD_SIZE_BYTES } from "@/lib/types";
import { saveUpload, deleteUpload } from "@/lib/storage";
import { enqueueJob, runCaseJobsInline } from "@/lib/jobs/queue";
import { rateLimit, getClientIp } from "@/lib/security/rateLimit";
import { analysisBudgetExceeded, BUDGET_EXCEEDED_MESSAGE } from "@/lib/aiBudget";
import { writeAuditLog } from "@/lib/security/audit";
import { sniffFileType } from "@/lib/security/fileSignature";

// The AI pipeline runs synchronously inline (see src/lib/jobs/worker.ts) —
// four sequential model calls can take longer than a typical default.
// Vercel's Hobby-plan default/max is already 300s with Fluid Compute, so
// this is mostly documentation, not a fix for an otherwise-broken default.
export const maxDuration = 60;

export async function GET() {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cases = await db.case.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ cases });
}

export async function POST(request: Request) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIp(request.headers);
  const { allowed } = await rateLimit(`case-create:${user.id}`, { limit: 10, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many uploads. Try again shortly." }, { status: 429 });
  }

  // Cheap check first: no file is read or stored for a user who is over today's AI budget.
  if (await analysisBudgetExceeded(user.id)) {
    return NextResponse.json({ error: BUDGET_EXCEEDED_MESSAGE }, { status: 429 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Invalid form submission." }, { status: 400 });
  }

  const parsed = newCaseSchema.safeParse({
    problemCategory: formData.get("problemCategory"),
    userStatedProblem: formData.get("userStatedProblem") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A document upload is required." }, { status: 400 });
  }
  if (!ALLOWED_UPLOAD_MIME_TYPES.includes(file.type as (typeof ALLOWED_UPLOAD_MIME_TYPES)[number])) {
    return NextResponse.json({ error: "Unsupported file type. Upload a PDF, PNG, JPEG, or WEBP." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return NextResponse.json({ error: "File is too large. Max size is 15MB." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // The client-declared MIME type is trivially spoofable — verify what the
  // bytes actually are before storing or handing them to the AI pipeline.
  const sniffedType = sniffFileType(bytes);
  if (!sniffedType) {
    return NextResponse.json(
      { error: "This file doesn't look like a valid PDF, PNG, JPEG, or WEBP. It may be corrupted or a different file type." },
      { status: 400 },
    );
  }

  const { problemCategory, userStatedProblem } = parsed.data;

  // Order matters. Store the file FIRST (nothing to roll back if it fails), then write the case,
  // document and timeline event in ONE atomic nested create, so a failure can never leave an orphan
  // case stuck at "analysis in progress" or a document without a case.
  let stored: { storageKey: string; sha256: string; sizeBytes: number };
  try {
    stored = await saveUpload({ userId: user.id, fileName: file.name, bytes });
  } catch {
    return NextResponse.json({ error: "We couldn't store your file. Please try again." }, { status: 502 });
  }

  let caseRecord: { id: string; documents: { id: string }[] };
  try {
    caseRecord = await db.case.create({
      data: {
        userId: user.id,
        problemCategory,
        userStatedProblem,
        caseType: "unknown",
        status: "analysis_in_progress",
        documents: {
          create: {
            userId: user.id,
            fileName: file.name,
            storageKey: stored.storageKey,
            mimeType: sniffedType,
            sizeBytes: stored.sizeBytes,
            sha256: stored.sha256,
            // Type is verified against the real content bytes (sniffFileType), size is capped, and the
            // name is sanitized. That is validation, NOT malware scanning: no scanner exists, so this
            // is recorded as "validated" and must never be described as scanned or clean.
            securityStatus: DOCUMENT_STATUS.validated,
          },
        },
        events: { create: { type: "document_added", message: `Uploaded ${file.name}.` } },
      },
      include: { documents: { select: { id: true } } },
    });
  } catch {
    await deleteUpload(stored.storageKey); // don't leave an orphaned file behind
    return NextResponse.json({ error: "We couldn't save your case. Please try again." }, { status: 500 });
  }

  try {
    await enqueueJob({
      caseId: caseRecord.id,
      type: "analyze_document",
      payload: { documentId: caseRecord.documents[0].id },
    });
  } catch {
    // The case and document are saved; only starting the analysis failed. Leave the case in a state
    // the user can recover from (adding information re-runs analysis) instead of "in progress" forever.
    await db.case.update({ where: { id: caseRecord.id }, data: { status: "information_needed" } });
    await db.caseEvent.create({
      data: { caseId: caseRecord.id, type: "system", message: "Analysis couldn't be started. Add more information to try again." },
    });
  }

  await writeAuditLog({
    userId: user.id,
    action: "case.create",
    resource: `case:${caseRecord.id}`,
    ip,
    metadata: { problemCategory },
  });

  // MVP: process the queue inline so the case is ready by the time we
  // respond. See src/lib/jobs/worker.ts for the swap-in seam to a real
  // background worker/queue for production.
  await runCaseJobsInline(caseRecord.id);

  return NextResponse.json({ caseId: caseRecord.id }, { status: 201 });
}
