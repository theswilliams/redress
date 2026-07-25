import { describe, it, expect } from "vitest";
import { rateLimit } from "@/lib/security/rateLimit";

// No UPSTASH_REDIS_REST_URL/TOKEN is set in the test environment, so these
// exercise the in-memory fallback path.
describe("rateLimit (in-memory fallback)", () => {
  it("allows requests under the limit", async () => {
    const key = `test:${Math.random()}`;
    const first = await rateLimit(key, { limit: 3, windowMs: 60_000 });
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(2);
  });

  it("blocks requests once the limit is exceeded", async () => {
    const key = `test:${Math.random()}`;
    await rateLimit(key, { limit: 2, windowMs: 60_000 });
    await rateLimit(key, { limit: 2, windowMs: 60_000 });
    const third = await rateLimit(key, { limit: 2, windowMs: 60_000 });
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });

  it("tracks separate keys independently", async () => {
    const keyA = `test:a:${Math.random()}`;
    const keyB = `test:b:${Math.random()}`;
    await rateLimit(keyA, { limit: 1, windowMs: 60_000 });
    const resultA = await rateLimit(keyA, { limit: 1, windowMs: 60_000 });
    const resultB = await rateLimit(keyB, { limit: 1, windowMs: 60_000 });
    expect(resultA.allowed).toBe(false);
    expect(resultB.allowed).toBe(true);
  });
});
