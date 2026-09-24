import { beforeEach, describe, expect, it, vi } from "vitest";

// Route-level tests for the human-approval gate (src/app/api/cases/[caseId]/approve/route.ts).
// The database, session, rate limiter, audit log and email provider are mocked so the
// tests exercise only the route's decision logic.

const mocks = vi.hoisted(() => ({
  requireUserApi: vi.fn(),
  rateLimit: vi.fn(),
  sendClaimEmail: vi.fn(),
  writeAuditLog: vi.fn(),
  db: {
    case: { findUnique: vi.fn(), update: vi.fn() },
    userApproval: { findFirst: vi.fn(), update: vi.fn() },
    communication: { findUnique: vi.fn(), update: vi.fn() },
    caseEvent: { create: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/session", () => ({ requireUserApi: mocks.requireUserApi }));
vi.mock("@/lib/security/rateLimit", () => ({
  rateLimit: mocks.rateLimit,
  getClientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/security/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("@/lib/email/send", () => ({ sendClaimEmail: mocks.sendClaimEmail }));

import { POST } from "@/app/api/cases/[caseId]/approve/route";

const CASE_ID = "case-1";
const call = (body: unknown) =>
  POST(
    new Request("http://localhost/api/cases/case-1/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ caseId: CASE_ID }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserApi.mockResolvedValue({ id: "user-1", email: "me@example.com" });
  mocks.rateLimit.mockResolvedValue({ allowed: true, remaining: 5 });
  mocks.db.case.findUnique.mockResolvedValue({ id: CASE_ID, userId: "user-1" });
  mocks.db.userApproval.findFirst.mockResolvedValue({
    id: "appr-1",
    proposedAction: JSON.stringify({ communicationId: "comm-1" }),
  });
  mocks.db.communication.findUnique.mockResolvedValue({
    id: "comm-1",
    caseId: CASE_ID,
    subject: "Refund request for order 123",
    body: "Hello, I would like a refund for order 123.",
  });
  mocks.sendClaimEmail.mockResolvedValue({ ok: true, providerMessageId: "msg-1" });
});

const sentUpdate = () =>
  mocks.db.communication.update.mock.calls.find(([arg]) => arg?.data?.status === "sent");

describe("approval gate", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.requireUserApi.mockResolvedValue(null);
    expect((await call({ decision: "approved", recipientEmail: "a@b.com" })).status).toBe(401);
    expect(mocks.sendClaimEmail).not.toHaveBeenCalled();
  });

  it("rate-limits repeated attempts", async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
    expect((await call({ decision: "approved", recipientEmail: "a@b.com" })).status).toBe(429);
    expect(mocks.sendClaimEmail).not.toHaveBeenCalled();
  });

  it("returns 404 for another user's case and never sends", async () => {
    mocks.db.case.findUnique.mockResolvedValue({ id: CASE_ID, userId: "someone-else" });
    expect((await call({ decision: "approved", recipientEmail: "a@b.com" })).status).toBe(404);
    expect(mocks.sendClaimEmail).not.toHaveBeenCalled();
  });

  it("returns 400 when nothing is pending approval", async () => {
    mocks.db.userApproval.findFirst.mockResolvedValue(null);
    expect((await call({ decision: "approved", recipientEmail: "a@b.com" })).status).toBe(400);
    expect(mocks.sendClaimEmail).not.toHaveBeenCalled();
  });

  it("requires the user to supply the recipient address", async () => {
    const res = await call({ decision: "approved" });
    expect(res.status).toBe(400);
    expect(mocks.sendClaimEmail).not.toHaveBeenCalled();
    expect(sentUpdate()).toBeUndefined();
  });

  it("rejects an invalid decision payload", async () => {
    expect((await call({ decision: "send-it-now", recipientEmail: "a@b.com" })).status).toBe(400);
    expect(mocks.sendClaimEmail).not.toHaveBeenCalled();
  });

  it("blocks drafts that still contain an unfilled placeholder", async () => {
    mocks.db.communication.findUnique.mockResolvedValue({
      id: "comm-1",
      caseId: CASE_ID,
      subject: "Refund",
      body: "Order [INSERT ORDER NUMBER] was never delivered.",
    });
    const res = await call({ decision: "approved", recipientEmail: "a@b.com" });
    expect(res.status).toBe(400);
    expect(mocks.sendClaimEmail).not.toHaveBeenCalled();
  });

  it("sends to the user-typed recipient, and only then marks the message sent", async () => {
    const res = await call({ decision: "approved", recipientEmail: "Support@Merchant.com" });
    expect(res.status).toBe(200);
    expect(mocks.sendClaimEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendClaimEmail.mock.calls[0][0]).toMatchObject({
      to: "support@merchant.com",
      replyTo: "me@example.com",
    });
    expect(sentUpdate()?.[0].data.recipientEmail).toBe("support@merchant.com");
    expect(mocks.db.userApproval.update.mock.calls[0][0].data.decision).toBe("approved");
    expect(mocks.db.case.update.mock.calls[0][0].data.status).toBe("submitted");
  });

  it("keeps the approval pending and returns 502 when the provider fails", async () => {
    mocks.sendClaimEmail.mockResolvedValue({ ok: false, error: "provider down" });
    const res = await call({ decision: "approved", recipientEmail: "a@b.com" });
    expect(res.status).toBe(502);
    expect(sentUpdate()).toBeUndefined();
    expect(mocks.db.communication.update.mock.calls[0][0].data.status).toBe("send_failed");
    expect(mocks.db.userApproval.update).not.toHaveBeenCalled();
    expect(mocks.db.case.update).not.toHaveBeenCalled();
  });

  it("editing a draft never sends anything", async () => {
    const res = await call({ decision: "edited", editedBody: "A better draft." });
    expect(res.status).toBe(200);
    expect(mocks.sendClaimEmail).not.toHaveBeenCalled();
    expect(sentUpdate()).toBeUndefined();
    expect(mocks.db.communication.update.mock.calls[0][0].data.body).toBe("A better draft.");
  });

  it("rejecting closes the case without sending", async () => {
    const res = await call({ decision: "rejected" });
    expect(res.status).toBe(200);
    expect(mocks.sendClaimEmail).not.toHaveBeenCalled();
    expect(mocks.db.case.update.mock.calls[0][0].data.status).toBe("closed");
  });
});
