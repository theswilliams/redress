import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUserApi } from "@/lib/session";

const noteSchema = z.object({ note: z.string().trim().min(1).max(2000) });

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { caseId } = await params;
  const caseRecord = await db.case.findUnique({ where: { id: caseId } });
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

  if (caseRecord.status === "ready_for_review" || caseRecord.status === "information_needed") {
    await db.case.update({ where: { id: caseId }, data: { status: "additional_information_requested" } });
  }

  return NextResponse.json({ ok: true });
}
