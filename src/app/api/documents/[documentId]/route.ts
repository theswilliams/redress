import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserApi } from "@/lib/session";
import { readUpload } from "@/lib/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { documentId } = await params;

  const document = await db.document.findUnique({ where: { id: documentId } });
  if (!document || document.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const bytes = await readUpload(document.storageKey);

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(document.fileName)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
