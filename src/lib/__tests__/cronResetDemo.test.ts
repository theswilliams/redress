import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ seedDemoAccount: vi.fn(), writeAuditLog: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/demoSeed", () => ({ seedDemoAccount: mocks.seedDemoAccount }));
vi.mock("@/lib/security/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));

import { GET } from "@/app/api/cron/reset-demo/route";

const call = (auth?: string) =>
  GET(new Request("http://localhost/api/cron/reset-demo", { headers: auth ? { authorization: auth } : {} }));

describe("GET /api/cron/reset-demo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "s3cret-value");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("refuses to run at all when CRON_SECRET isn't configured (fail closed)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(503);
    expect(mocks.seedDemoAccount).not.toHaveBeenCalled();
  });

  it("rejects a missing or wrong secret", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect((await call("s3cret-value")).status).toBe(401);
    expect(mocks.seedDemoAccount).not.toHaveBeenCalled();
  });

  it("resets the demo account with the right secret", async () => {
    expect((await call("Bearer s3cret-value")).status).toBe(200);
    expect(mocks.seedDemoAccount).toHaveBeenCalledTimes(1);
  });
});
