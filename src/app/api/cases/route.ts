import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserApi } from "@/lib/session";
import { newCaseSchema } from "@/lib/validation";
import { ALLOWED_UPLOAD_MIME_TYPES, DOCUMENT_STATUS, MAX_UPLOAD_SIZE_BYTES } from "@/lib/types";
import { saveUpload } from "@/lib/storage";
import { enqueueJob, runCaseJobsInline } from "@/lib/jobs/queue";
import { rateLimit, getClientIp } from "@/lib/security/rateLimit";
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

  const caseRecord = await db.case.create({
    data: {
      userId: user.id,
      problemCategory,
      userStatedProblem,
      caseType: "unknown",
      status: "analysis_in_progress",
    },
  });

  const { storageKey, sha256, sizeBytes } = await saveUpload({
    userId: user.id,
    fileName: file.name,
    bytes,
  });

  const document = await db.document.create({
    data: {
      userId: user.id,
      caseId: caseRecord.id,
      fileName: file.name,
      storageKey,
      mimeType: sniffedType,
      sizeBytes,
      sha256,
      // Type is verified against the real content bytes (sniffFileType), size is capped, and the
      // name is sanitized. That is validation, NOT malware scanning: no scanner exists, so this
      // is recorded as "validated" and must never be described as scanned or clean.
      securityStatus: DOCUMENT_STATUS.validated,
    },
  });

  await db.caseEvent.create({
    data: {
      caseId: caseRecord.id,
      type: "document_added",
      message: `Uploaded ${file.name}.`,
    },
  });

  await enqueueJob({ caseId: caseRecord.id, type: "analyze_document", payload: { documentId: document.id } });

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
