import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserApi } from "@/lib/session";

export async function GET(_request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { caseId } = await params;

  const caseRecord = await db.case.findUnique({
    where: { id: caseId },
    include: {
      documents: true,
      transactions: true,
      communications: true,
      events: { orderBy: { createdAt: "asc" } },
      approvals: true,
      outcomes: true,
      policySources: true,
      analyses: true,
    },
  });

  if (!caseRecord || caseRecord.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ case: caseRecord });
}
