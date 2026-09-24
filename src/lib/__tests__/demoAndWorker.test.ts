import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserApi: vi.fn(),
  rateLimit: vi.fn(),
  runAnalysisPipeline: vi.fn(),
  db: {
    user: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn(), delete: vi.fn(), update: vi.fn() },
    passwordResetToken: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    job: { findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    caseEvent: { create: vi.fn() },
    case: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/session", () => ({ requireUserApi: mocks.requireUserApi }));
vi.mock("@/lib/security/rateLimit", () => ({ rateLimit: mocks.rateLimit, getClientIp: () => "127.0.0.1" }));
vi.mock("@/lib/security/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/storage", () => ({ deleteAllUploadsForUser: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ sendPasswordResetEmail: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/ai/pipeline", () => ({ runAnalysisPipeline: mocks.runAnalysisPipeline }));

import { DEMO_EMAIL, isDemoEmail } from "@/lib/demo";
import { DELETE as deleteAccount } from "@/app/api/account/route";
import { POST as requestReset } from "@/app/api/password-reset/request/route";
import { POST as confirmReset } from "@/app/api/password-reset/confirm/route";
import { processQueuedJobs } from "@/lib/jobs/worker";

const json = (url: string, method: string, body: unknown) =>
  new Request(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rateLimit.mockResolvedValue({ allowed: true, remaining: 5 });
});

describe("shared demo account protection", () => {
  it("recognises the demo email case-insensitively", () => {
    expect(isDemoEmail(DEMO_EMAIL)).toBe(true);
    expect(isDemoEmail("  Demo@Redress.App ")).toBe(true);
    expect(isDemoEmail("someone@example.com")).toBe(false);
    expect(isDemoEmail(null)).toBe(false);
  });

  it("cannot be deleted", async () => {
    mocks.requireUserApi.mockResolvedValue({ id: "demo-id", email: DEMO_EMAIL });
    const res = await deleteAccount(json("/api/account", "DELETE", { password: "anything" }));
    expect(res.status).toBe(403);
    expect(mocks.db.user.delete).not.toHaveBeenCalled();
  });

  it("other accounts can still reach the delete flow (password is checked)", async () => {
    mocks.requireUserApi.mockResolvedValue({ id: "u1", email: "me@example.com" });
    mocks.db.user.findUniqueOrThrow.mockResolvedValue({ id: "u1", passwordHash: "not-a-real-hash" });
    const res = await deleteAccount(json("/api/account", "DELETE", { password: "wrong" }));
    expect(res.status).toBe(400); // "Incorrect password."
    expect(mocks.db.user.delete).not.toHaveBeenCalled();
  });

  it("no reset token is created for the demo account, and the response looks identical", async () => {
    mocks.db.user.findUnique.mockResolvedValue({ id: "demo-id", email: DEMO_EMAIL });
    const res = await requestReset(json("/api/password-reset/request", "POST", { email: DEMO_EMAIL }));
    expect(res.status).toBe(200);
    expect(mocks.db.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it("a reset token for the demo account cannot change its password", async () => {
    mocks.db.passwordResetToken.findUnique.mockResolvedValue({
      id: "t1",
      userId: "demo-id",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    mocks.db.user.findUnique.mockResolvedValue({ email: DEMO_EMAIL });
    const res = await confirmReset(
      json("/api/password-reset/confirm", "POST", { token: "x".repeat(64), password: "NewPassword123!" }),
    );
    expect(res.status).toBe(400);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });
});

describe("processQueuedJobs", () => {
  const job = { id: "job-1", type: "analyze_document", caseId: "case-1", payload: JSON.stringify({ documentId: "doc-1" }) };

  it("runs a job it successfully claimed and marks it succeeded", async () => {
    mocks.db.job.findMany.mockResolvedValue([job]);
    mocks.db.job.updateMany.mockResolvedValue({ count: 1 });
    mocks.runAnalysisPipeline.mockResolvedValue(undefined);
    await processQueuedJobs();
    expect(mocks.runAnalysisPipeline).toHaveBeenCalledWith("case-1", "doc-1");
    expect(mocks.db.job.update.mock.calls[0][0].data.status).toBe("succeeded");
  });

  it("skips a job another worker already claimed", async () => {
    mocks.db.job.findMany.mockResolvedValue([job]);
    mocks.db.job.updateMany.mockResolvedValue({ count: 0 });
    await processQueuedJobs();
    expect(mocks.runAnalysisPipeline).not.toHaveBeenCalled();
    expect(mocks.db.job.update).not.toHaveBeenCalled();
  });

  it("marks a failing job failed (no automatic retry) and asks the user for more information", async () => {
    mocks.db.job.findMany.mockResolvedValue([job]);
    mocks.db.job.updateMany.mockResolvedValue({ count: 1 });
    mocks.runAnalysisPipeline.mockRejectedValue(new Error("model error"));
    await processQueuedJobs();
    expect(mocks.db.job.update.mock.calls[0][0].data).toMatchObject({ status: "failed", error: "model error" });
    expect(mocks.db.case.update.mock.calls[0][0].data.status).toBe("information_needed");
    expect(mocks.db.caseEvent.create.mock.calls[0][0].data.message).not.toMatch(/our team/i);
  });
});
