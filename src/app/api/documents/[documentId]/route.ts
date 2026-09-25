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
      "Content-Disposition": `inline; filename="${encodeURIComponent(document.fileName)}"`, // percent-encoded: no quotes/CRLF
      "Cache-Control": "private, no-store",
      // Uploaded files are untrusted: never let the browser sniff a different type, and sandbox
      // the response so an embedded script can't run with this site's origin.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
    },
  });
}
