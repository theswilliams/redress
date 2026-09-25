import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";
import { SECURITY_HEADERS } from "@/lib/securityHeaders";

const value = (key: string) => SECURITY_HEADERS.find((h) => h.key === key)?.value;

describe("security headers", () => {
  it("sets the baseline headers, including clickjacking protection for the approval UI", () => {
    expect(value("X-Content-Type-Options")).toBe("nosniff");
    expect(value("X-Frame-Options")).toBe("DENY");
    expect(value("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(value("Permissions-Policy")).toMatch(/camera=\(\)/);
  });

  it("are applied to every route by next.config", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/:path*");
    expect(all).toBeDefined();
    expect(all!.headers).toEqual(SECURITY_HEADERS);
  });
});
