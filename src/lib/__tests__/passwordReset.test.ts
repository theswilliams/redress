import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashToken } from "@/lib/security/tokens";

// Emailed-link tokens are stored hashed, and a reset link can be used exactly once.

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  writeAuditLog: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  db: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    passwordResetToken: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/security/rateLimit", () => ({ rateLimit: mocks.rateLimit, getClientIp: () => "127.0.0.1" }));
vi.mock("@/lib/security/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("@/lib/email/send", () => ({ sendPasswordResetEmail: mocks.sendPasswordResetEmail }));

import { POST as requestReset } from "@/app/api/password-reset/request/route";
import { POST as confirmReset } from "@/app/api/password-reset/confirm/route";

const post = (body: unknown) =>
  new Request("http://localhost/api/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rateLimit.mockResolvedValue({ allowed: true, remaining: 5 });
  mocks.sendPasswordResetEmail.mockResolvedValue({ ok: true, providerMessageId: "m1" });
});

describe("password reset tokens", () => {
  it("stores only the hash; the raw token is only in the emailed link", async () => {
    mocks.db.user.findUnique.mockResolvedValue({ id: "u1", email: "me@example.com" });
    await requestReset(post({ email: "me@example.com" }));

    const stored = mocks.db.passwordResetToken.create.mock.calls[0][0].data.token as string;
    const link = mocks.sendPasswordResetEmail.mock.calls[0][0].resetUrl as string;
    const raw = new URL(link).searchParams.get("token")!;
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    expect(stored).not.toBe(raw);
    expect(stored).toBe(hashToken(raw));
  });

  it("looks the token up by its hash", async () => {
    mocks.db.passwordResetToken.findUnique.mockResolvedValue(null);
    await confirmReset(post({ token: "abc", password: "a-new-password" }));
    expect(mocks.db.passwordResetToken.findUnique.mock.calls[0][0].where.token).toBe(hashToken("abc"));
  });

  it("a stored hash pasted as the token does not work", async () => {
    mocks.db.passwordResetToken.findUnique.mockImplementation(async ({ where }) =>
      where.token === hashToken("real") ? { id: "t1", userId: "u1", usedAt: null, expiresAt: new Date(Date.now() + 60_000) } : null,
    );
    const res = await confirmReset(post({ token: hashToken("real"), password: "a-new-password" }));
    expect(res.status).toBe(400);
    expect(mocks.db.user.update).not.toHaveBeenCalled();
  });

  it("a link can only be spent once, even by concurrent requests", async () => {
    mocks.db.passwordResetToken.findUnique.mockResolvedValue({
      id: "t1",
      userId: "u1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    mocks.db.user.findUnique.mockResolvedValue({ email: "me@example.com" });
    let spent = false;
    mocks.db.passwordResetToken.updateMany.mockImplementation(async () => {
      if (spent) return { count: 0 };
      spent = true;
      return { count: 1 };
    });

    const [a, b] = await Promise.all([
      confirmReset(post({ token: "real", password: "first-password" })),
      confirmReset(post({ token: "real", password: "second-password" })),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 400]);
    expect(mocks.db.user.update).toHaveBeenCalledTimes(1);
  });
});
