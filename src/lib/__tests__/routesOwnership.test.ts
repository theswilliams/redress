import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression tests for the ownership boundary (IDOR/BOLA) on every user-data route, plus the
// honest document status and inline job execution on upload. The database, session, storage,
// rate limiter and job runner are mocked so the tests exercise only each route's decisions.

const mocks = vi.hoisted(() => ({
  requireUserApi: vi.fn(),
  rateLimit: vi.fn(),
  readUpload: vi.fn(),
  saveUpload: vi.fn(),
  deleteUpload: vi.fn(),
  enqueueJob: vi.fn(),
  runCaseJobsInline: vi.fn(),
  writeAuditLog: vi.fn(),
  db: {
    case: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    document: { findUnique: vi.fn(), create: vi.fn() },
    caseEvent: { create: vi.fn() },
    recoveryOutcome: { create: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/session", () => ({ requireUserApi: mocks.requireUserApi }));
vi.mock("@/lib/security/rateLimit", () => ({ rateLimit: mocks.rateLimit, getClientIp: () => "127.0.0.1" }));
vi.mock("@/lib/security/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("@/lib/storage", () => ({ readUpload: mocks.readUpload, saveUpload: mocks.saveUpload, deleteUpload: mocks.deleteUpload }));
vi.mock("@/lib/jobs/queue", () => ({ enqueueJob: mocks.enqueueJob, runCaseJobsInline: mocks.runCaseJobsInline }));

import { GET as getDocument } from "@/app/api/documents/[documentId]/route";
import { GET as getCase } from "@/app/api/cases/[caseId]/route";
import { GET as listCases, POST as createCase } from "@/app/api/cases/route";
import { POST as addNote } from "@/app/api/cases/[caseId]/notes/route";
import { POST as recordOutcome } from "@/app/api/cases/[caseId]/outcome/route";

const ME = { id: "user-me", email: "me@example.com" };
const req = (method: string, body?: unknown) =>
  new Request("http://localhost/api/x", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserApi.mockResolvedValue(ME);
  mocks.rateLimit.mockResolvedValue({ allowed: true, remaining: 5 });
});

describe("GET /api/documents/[documentId]", () => {
  const doc = { id: "d1", userId: ME.id, storageKey: "user-me/abc-file.pdf", mimeType: "application/pdf", fileName: "receipt.pdf" };

  it("requires authentication", async () => {
    mocks.requireUserApi.mockResolvedValue(null);
    expect((await getDocument(req("GET"), ctx({ documentId: "d1" }))).status).toBe(401);
    expect(mocks.readUpload).not.toHaveBeenCalled();
  });

  it("returns 404 for another user's document and never reads the file", async () => {
    mocks.db.document.findUnique.mockResolvedValue({ ...doc, userId: "someone-else" });
    const res = await getDocument(req("GET"), ctx({ documentId: "d1" }));
    expect(res.status).toBe(404);
    expect(mocks.readUpload).not.toHaveBeenCalled();
  });

  it("returns 404 for a document that does not exist (same response as someone else's)", async () => {
    mocks.db.document.findUnique.mockResolvedValue(null);
    expect((await getDocument(req("GET"), ctx({ documentId: "nope" }))).status).toBe(404);
  });

  it("serves your own document with hardened headers", async () => {
    mocks.db.document.findUnique.mockResolvedValue(doc);
    mocks.readUpload.mockResolvedValue(Buffer.from("%PDF-1.7 test"));
    const res = await getDocument(req("GET"), ctx({ documentId: "d1" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toMatch(/sandbox/);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("cannot be tricked into header injection by a hostile file name", async () => {
    mocks.db.document.findUnique.mockResolvedValue({ ...doc, fileName: 'a"; x=y\r\nSet-Cookie: pwned=1' });
    mocks.readUpload.mockResolvedValue(Buffer.from("%PDF-"));
    const res = await getDocument(req("GET"), ctx({ documentId: "d1" }));
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("content-disposition")).not.toMatch(/[\r\n]/);
  });
});

describe("GET /api/cases/[caseId]", () => {
  it("returns 404 for another user's case", async () => {
    mocks.db.case.findUnique.mockResolvedValue({ id: "c1", userId: "someone-else", documents: [] });
    expect((await getCase(req("GET"), ctx({ caseId: "c1" }))).status).toBe(404);
  });

  it("does not expose internal storage keys or raw extracted text of documents", async () => {
    mocks.db.case.findUnique.mockResolvedValue({ id: "c1", userId: ME.id, documents: [] });
    await getCase(req("GET"), ctx({ caseId: "c1" }));
    const include = mocks.db.case.findUnique.mock.calls[0][0].include;
    expect(include.documents.select).toBeDefined();
    expect(include.documents.select.storageKey).toBeUndefined();
    expect(include.documents.select.extractedText).toBeUndefined();
    expect(include.documents.select.securityStatus).toBe(true);
  });
});

describe("GET /api/cases (list)", () => {
  it("only queries the signed-in user's cases", async () => {
    mocks.db.case.findMany.mockResolvedValue([]);
    await listCases();
    expect(mocks.db.case.findMany.mock.calls[0][0].where).toEqual({ userId: ME.id });
  });
});

describe("POST /api/cases/[caseId]/notes", () => {
  it("returns 404 for another user's case: no event written, no job enqueued", async () => {
    mocks.db.case.findUnique.mockResolvedValue({ id: "c1", userId: "someone-else", status: "ready_for_review", documents: [{ id: "d1" }] });
    const res = await addNote(req("POST", { note: "extra info" }), ctx({ caseId: "c1" }));
    expect(res.status).toBe(404);
    expect(mocks.db.caseEvent.create).not.toHaveBeenCalled();
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
    expect(mocks.runCaseJobsInline).not.toHaveBeenCalled();
  });

  it("re-runs analysis for your own case, scoped to that case", async () => {
    mocks.db.case.findUnique.mockResolvedValue({ id: "c1", userId: ME.id, status: "ready_for_review", userStatedProblem: "x", documents: [{ id: "d1" }] });
    const res = await addNote(req("POST", { note: "extra info" }), ctx({ caseId: "c1" }));
    expect(res.status).toBe(200);
    expect(mocks.runCaseJobsInline).toHaveBeenCalledWith("c1");
  });
});

describe("POST /api/cases/[caseId]/outcome", () => {
  it("returns 404 for another user's case and records nothing", async () => {
    mocks.db.case.findUnique.mockResolvedValue({ id: "c1", userId: "someone-else", status: "submitted" });
    const res = await recordOutcome(
      req("POST", { action: "record_outcome", outcomeType: "full_refund", recoveredCents: 5000 }),
      ctx({ caseId: "c1" }),
    );
    expect(res.status).toBe(404);
    expect(mocks.db.recoveryOutcome.create).not.toHaveBeenCalled();
    expect(mocks.db.case.update).not.toHaveBeenCalled();
  });
});

describe("POST /api/cases (upload)", () => {
  const upload = (bytes: Buffer, type = "application/pdf") => {
    const form = new FormData();
    form.set("problemCategory", "refund");
    form.set("userStatedProblem", "Item never arrived");
    form.set("file", new File([new Uint8Array(bytes)], "receipt.pdf", { type }));
    return new Request("http://localhost/api/cases", { method: "POST", body: form });
  };

  beforeEach(() => {
    mocks.db.case.create.mockResolvedValue({ id: "case-new", documents: [{ id: "doc-new" }] });
    mocks.saveUpload.mockResolvedValue({ storageKey: "user-me/k-receipt.pdf", sha256: "abc", sizeBytes: 20 });
  });

  it("records an uploaded file as 'validated', never as clean/scanned (no scanner exists)", async () => {
    const res = await createCase(upload(Buffer.from("%PDF-1.7 fake pdf content")));
    expect(res.status).toBeLessThan(300);
    const data = mocks.db.case.create.mock.calls[0][0].data.documents.create;
    expect(data.securityStatus).toBe("validated");
    expect(JSON.stringify(data)).not.toMatch(/clean|scanned/i);
  });

  it("runs the analysis job inline and scoped to the new case", async () => {
    await createCase(upload(Buffer.from("%PDF-1.7 fake pdf content")));
    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: "case-new", type: "analyze_document", payload: { documentId: "doc-new" } }),
    );
    expect(mocks.runCaseJobsInline).toHaveBeenCalledWith("case-new");
  });

  it("rejects a file whose bytes are not a real PDF/image even if the declared type says PDF", async () => {
    const res = await createCase(upload(Buffer.from("MZ\x90\x00 this is an executable pretending to be a pdf")));
    expect(res.status).toBe(400);
    expect(mocks.db.case.create).not.toHaveBeenCalled();
    expect(mocks.saveUpload).not.toHaveBeenCalled();
  });

  it("rejects unsupported declared types and oversized files before storing anything", async () => {
    expect((await createCase(upload(Buffer.from("%PDF-1.7 x"), "text/html"))).status).toBe(400);
    const big = Buffer.alloc(15 * 1024 * 1024 + 1, 0x25);
    expect((await createCase(upload(big))).status).toBe(400);
    expect(mocks.saveUpload).not.toHaveBeenCalled();
  });

  describe("partial failures never leave orphans", () => {
    it("if the file can't be stored, no case is created at all", async () => {
      mocks.saveUpload.mockRejectedValue(new Error("blob unavailable"));
      const res = await createCase(upload(Buffer.from("%PDF-1.7 fake pdf content")));
      expect(res.status).toBe(502);
      expect(mocks.db.case.create).not.toHaveBeenCalled();
      expect(mocks.enqueueJob).not.toHaveBeenCalled();
    });

    it("stores the file BEFORE writing the case (so a storage failure has nothing to roll back)", async () => {
      const order: string[] = [];
      mocks.saveUpload.mockImplementation(async () => {
        order.push("store");
        return { storageKey: "user-me/k.pdf", sha256: "abc", sizeBytes: 20 };
      });
      mocks.db.case.create.mockImplementation(async () => {
        order.push("case");
        return { id: "case-new", documents: [{ id: "doc-new" }] };
      });
      await createCase(upload(Buffer.from("%PDF-1.7 fake pdf content")));
      expect(order).toEqual(["store", "case"]);
    });

    it("writes the case, document and timeline event in ONE nested create (atomic)", async () => {
      await createCase(upload(Buffer.from("%PDF-1.7 fake pdf content")));
      expect(mocks.db.case.create).toHaveBeenCalledTimes(1);
      const data = mocks.db.case.create.mock.calls[0][0].data;
      expect(data.documents.create).toBeDefined();
      expect(data.events.create.type).toBe("document_added");
      expect(mocks.db.document.create).not.toHaveBeenCalled();
    });

    it("if the database write fails, the already-stored file is deleted and no job is queued", async () => {
      mocks.db.case.create.mockRejectedValue(new Error("db down"));
      const res = await createCase(upload(Buffer.from("%PDF-1.7 fake pdf content")));
      expect(res.status).toBe(500);
      expect(mocks.deleteUpload).toHaveBeenCalledWith("user-me/k-receipt.pdf");
      expect(mocks.enqueueJob).not.toHaveBeenCalled();
    });

    it("if the analysis job can't be queued, the case is left in a recoverable state, not 'in progress' forever", async () => {
      mocks.enqueueJob.mockRejectedValue(new Error("queue down"));
      const res = await createCase(upload(Buffer.from("%PDF-1.7 fake pdf content")));
      expect(res.status).toBe(201);
      expect(mocks.db.case.update.mock.calls[0][0].data.status).toBe("information_needed");
      expect(mocks.db.caseEvent.create).toHaveBeenCalledTimes(1);
      expect(mocks.deleteUpload).not.toHaveBeenCalled(); // the saved case keeps its file
    });
  });
});
