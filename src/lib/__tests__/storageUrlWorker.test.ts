import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- storage path containment -------------------------------------------------------------
import { isInsideStorageRoot } from "@/lib/storage";

describe("isInsideStorageRoot", () => {
  const root = path.resolve("/srv/app/storage/uploads");

  it("accepts the root and paths beneath it", () => {
    expect(isInsideStorageRoot(root, root)).toBe(true);
    expect(isInsideStorageRoot(path.join(root, "user-1", "file.pdf"), root)).toBe(true);
  });

  it("rejects traversal out of the root", () => {
    expect(isInsideStorageRoot(path.join(root, "..", "secrets.txt"), root)).toBe(false);
    expect(isInsideStorageRoot(path.join(root, "user-1", "..", "..", "etc", "passwd"), root)).toBe(false);
  });

  it("rejects a sibling directory that merely shares the root's name as a prefix", () => {
    // The old check was `fullPath.startsWith(STORAGE_ROOT)`, which accepts this.
    expect(isInsideStorageRoot(root + "-evil/file.pdf", root)).toBe(false);
    expect(isInsideStorageRoot(root + "2", root)).toBe(false);
  });
});

// --- emailed link base URL ----------------------------------------------------------------
import { appOrigin, appUrl } from "@/lib/appUrl";

describe("appOrigin / appUrl (password-reset poisoning)", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.APP_URL;
    delete process.env.AUTH_URL;
    delete process.env.NEXTAUTH_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("ignores a hostile request host when APP_URL is configured", () => {
    process.env.APP_URL = "https://redress.example.com";
    expect(appUrl("/reset-password/confirm?token=t", "https://evil.example/api/password-reset/request")).toBe(
      "https://redress.example.com/reset-password/confirm?token=t",
    );
  });

  it("uses the Vercel production URL when nothing else is configured", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "redress-weld.vercel.app";
    expect(appOrigin("https://evil.example/x")).toBe("https://redress-weld.vercel.app");
  });

  it("falls back to the request origin only when nothing is configured (local dev)", () => {
    expect(appOrigin("http://localhost:3000/api/x")).toBe("http://localhost:3000");
  });

  it("ignores an invalid configured value", () => {
    process.env.APP_URL = "not a url";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "prod.example.com";
    expect(appOrigin("http://localhost:3000")).toBe("https://prod.example.com");
  });
});

// --- job scoping --------------------------------------------------------------------------
const jobMocks = vi.hoisted(() => ({
  runAnalysisPipeline: vi.fn(),
  db: {
    job: { findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    caseEvent: { create: vi.fn() },
    case: { update: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ db: jobMocks.db }));
vi.mock("@/lib/ai/pipeline", () => ({ runAnalysisPipeline: jobMocks.runAnalysisPipeline }));

import { processQueuedJobs } from "@/lib/jobs/worker";

describe("processQueuedJobs scoping", () => {
  beforeEach(() => vi.clearAllMocks());

  it("only selects the caller's case when a caseId is given (one user's request can't run another's job)", async () => {
    jobMocks.db.job.findMany.mockResolvedValue([]);
    await processQueuedJobs({ caseId: "case-A" });
    expect(jobMocks.db.job.findMany.mock.calls[0][0].where).toEqual({ status: "queued", caseId: "case-A" });
  });

  it("without a caseId (future background worker) selects all queued jobs", async () => {
    jobMocks.db.job.findMany.mockResolvedValue([]);
    await processQueuedJobs();
    expect(jobMocks.db.job.findMany.mock.calls[0][0].where).toEqual({ status: "queued" });
  });
});
