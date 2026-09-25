import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUserApi } from "@/lib/session";
import { rateLimit } from "@/lib/security/rateLimit";
import { enqueueJob, runCaseJobsInline } from "@/lib/jobs/queue";

const noteSchema = z.object({ note: z.string().trim().min(1).max(2000) });

// May re-run the full AI pipeline synchronously — see the comment in
// app/api/cases/route.ts.
export const maxDuration = 60;

// Statuses where the note is genuinely new information Redress hasn't
// reasoned about yet, so it's worth spending an AI call to reconsider.
const RERUNNABLE_STATUSES = ["ready_for_review", "information_needed", "additional_information_requested"];

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { caseId } = await params;

  const { allowed } = await rateLimit(`notes:${user.id}`, { limit: 10, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  const caseRecord = await db.case.findUnique({
    where: { id: caseId },
    include: { documents: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!caseRecord || caseRecord.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = noteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  await db.caseEvent.create({
    data: { caseId, type: "note", message: parsed.data.note },
  });

  const latestDocument = caseRecord.documents[0];
  const canRerun = RERUNNABLE_STATUSES.includes(caseRecord.status) && latestDocument;

  if (canRerun) {
    // Fold the note into the context Redress reasons about, then re-run the
    // pipeline against it — this is what actually makes "Add More
    // Information" do something, rather than just logging a comment nobody
    // reconsiders.
    const updatedContext = caseRecord.userStatedProblem
      ? `${caseRecord.userStatedProblem}\n\nAdditional information from the user: ${parsed.data.note}`
      : `Additional information from the user: ${parsed.data.note}`;

    await db.case.update({
      where: { id: caseId },
      data: { userStatedProblem: updatedContext, status: "analysis_in_progress" },
    });

    await enqueueJob({ caseId, type: "analyze_document", payload: { documentId: latestDocument.id } });
    await runCaseJobsInline(caseId);
  } else if (caseRecord.status === "ready_for_review" || caseRecord.status === "information_needed") {
    await db.case.update({ where: { id: caseId }, data: { status: "additional_information_requested" } });
  }

  return NextResponse.json({ ok: true });
}
