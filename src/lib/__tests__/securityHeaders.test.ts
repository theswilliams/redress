import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";
import { SECURITY_HEADERS, contentSecurityPolicy } from "@/lib/securityHeaders";

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

  it("sets a content security policy on pages, not on API routes", async () => {
    const rules = await nextConfig.headers!();
    const csp = rules.find((r) => r.headers.some((h) => h.key === "Content-Security-Policy"));
    expect(csp).toBeDefined();
    const pattern = new RegExp(`^${csp!.source.replace("/(", "/(")}$`);
    expect(pattern.test("/dashboard/cases/abc")).toBe(true);
    expect(pattern.test("/")).toBe(true);
    expect(pattern.test("/api/documents/abc")).toBe(false);
  });

  it("production CSP blocks plugins, framing, base hijacking and off-site form posts, and has no eval", () => {
    const policy = contentSecurityPolicy(false);
    for (const directive of ["object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "default-src 'self'"]) {
      expect(policy).toContain(directive);
    }
    expect(policy).not.toContain("unsafe-eval");
    expect(contentSecurityPolicy(true)).toContain("unsafe-eval");
  });
});
