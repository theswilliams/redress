import { beforeAll, describe, expect, it } from "vitest";
import { PROBLEM_CATEGORIES } from "@/lib/types";
import { DEMO_EMAIL, DEMO_PASSWORD_HINT } from "@/lib/demo";

// Critical-path smoke tests over real HTTP against a running production build (`next build` +
// `next start`) with a real Postgres database. See README → Testing for how to run them.
//
// Run with no GEMINI_API_KEY and no RESEND_API_KEY: analysis runs in the labelled demo mode and
// approvals are simulated, so nothing external is contacted. The database must have the demo
// account seeded (`npx tsx scripts/seed-demo.ts`).

const BASE = process.env.E2E_BASE_URL;
const run = BASE ? describe : describe.skip;

class Session {
  private cookies = new Map<string, string>();

  async fetch(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (this.cookies.size) headers.set("cookie", [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    const res = await fetch(BASE + path, { ...init, headers, redirect: "manual" });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    return res;
  }

  json(path: string, body: unknown, method = "POST") {
    return this.fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  }

  async signIn(email: string, password: string) {
    const { csrfToken } = await (await this.fetch("/api/auth/csrf")).json();
    const res = await this.fetch("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/dashboard` }),
    });
    const location = res.headers.get("location") ?? "";
    return !location.includes("error");
  }
}

function tinyPdf(): Blob {
  const pdf =
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF";
  return new Blob([pdf], { type: "application/pdf" });
}

run("smoke: critical user journey", () => {
  const stamp = Date.now();
  const alice = { name: "Alice", email: `alice-${stamp}@example.test`, password: "alice-password-123" };
  const bob = { name: "Bob", email: `bob-${stamp}@example.test`, password: "bob-password-1234" };
  const a = new Session();
  const b = new Session();
  let caseId = "";
  let documentId = "";

  beforeAll(async () => {
    for (const u of [alice, bob]) {
      const res = await new Session().json("/api/register", u);
      expect(res.status).toBe(200);
    }
    expect(await a.signIn(alice.email, alice.password)).toBe(true);
    expect(await b.signIn(bob.email, bob.password)).toBe(true);
  });

  it("landing page loads with the demo section and a content security policy", async () => {
    const res = await fetch(`${BASE}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Try the demo");
    expect(res.headers.get("content-security-policy")).toContain("object-src 'none'");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });

  it("privacy and terms pages load", async () => {
    expect((await fetch(`${BASE}/privacy`)).status).toBe(200);
    expect((await fetch(`${BASE}/terms`)).status).toBe(200);
  });

  it("signed-out visitors are sent to sign in, and the API refuses them", async () => {
    const page = await fetch(`${BASE}/dashboard`, { redirect: "manual" });
    expect([302, 303, 307]).toContain(page.status);
    expect(page.headers.get("location")).toContain("/signin");
    expect((await fetch(`${BASE}/api/cases`)).status).toBe(401);
  });

  it("a wrong password does not sign in", async () => {
    expect(await new Session().signIn(alice.email, "not-the-password")).toBe(false);
  });

  it("creates a case from an uploaded document (demo-mode analysis, never 'ready')", async () => {
    const form = new FormData();
    form.set("problemCategory", PROBLEM_CATEGORIES[0]);
    form.set("userStatedProblem", "Smoke test case.");
    form.set("file", tinyPdf(), "receipt.pdf");
    const res = await a.fetch("/api/cases", { method: "POST", body: form });
    expect(res.status).toBe(201);
    caseId = (await res.json()).caseId;

    const { case: c } = await (await a.fetch(`/api/cases/${caseId}`)).json();
    documentId = c.documents[0].id;
    expect(c.documents[0].securityStatus).toBe("validated");
    expect(c.documents[0]).not.toHaveProperty("storageKey");
    expect(c.status).toBe("information_needed");
    expect(c.approvals.some((x: { decision: string }) => x.decision === "pending")).toBe(true);
    expect(c.communications.every((x: { status: string }) => x.status === "draft")).toBe(true);
  });

  it("rejects a disguised file (wrong magic bytes)", async () => {
    const form = new FormData();
    form.set("problemCategory", PROBLEM_CATEGORIES[0]);
    form.set("file", new Blob(["<html><script>alert(1)</script>"], { type: "application/pdf" }), "fake.pdf");
    expect((await a.fetch("/api/cases", { method: "POST", body: form })).status).toBe(400);
  });

  it("another user gets 404 for the case, its document and its approval", async () => {
    expect((await b.fetch(`/api/cases/${caseId}`)).status).toBe(404);
    expect((await b.fetch(`/api/documents/${documentId}`)).status).toBe(404);
    expect((await b.json(`/api/cases/${caseId}/approve`, { decision: "approved", recipientEmail: "x@example.test" })).status).toBe(404);
    expect((await b.fetch(`/dashboard/cases/${caseId}`)).status).toBe(404);
  });

  it("the owner can open the document", async () => {
    const res = await a.fetch(`/api/documents/${documentId}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
  });

  it("approval requires a recipient the user typed", async () => {
    const res = await a.json(`/api/cases/${caseId}/approve`, { decision: "approved" });
    expect(res.status).toBe(400);
  });

  it("approving submits once (simulated, labelled), and a second approval can't resend", async () => {
    const res = await a.json(`/api/cases/${caseId}/approve`, { decision: "approved", recipientEmail: "support@merchant.test" });
    expect(res.status).toBe(200);
    expect((await res.json()).simulated).toBe(true);

    const { case: c } = await (await a.fetch(`/api/cases/${caseId}`)).json();
    expect(c.status).toBe("submitted");
    expect(c.events.map((e: { message: string }) => e.message).join("\n")).toMatch(/Simulated submission/);

    const again = await a.json(`/api/cases/${caseId}/approve`, { decision: "approved", recipientEmail: "support@merchant.test" });
    expect(again.status).toBe(400);
  });

  it("the shared demo account signs in, and its approvals are always simulated", async () => {
    const demo = new Session();
    expect(await demo.signIn(DEMO_EMAIL, DEMO_PASSWORD_HINT)).toBe(true);
    const { cases } = await (await demo.fetch("/api/cases")).json();
    const ready = cases.find((c: { status: string }) => c.status === "ready_for_review");
    expect(ready).toBeDefined();

    const res = await demo.json(`/api/cases/${ready.id}/approve`, { decision: "approved", recipientEmail: "support@merchant.test" });
    expect(res.status).toBe(200);
    expect((await res.json()).simulated).toBe(true);
    const { case: c } = await (await demo.fetch(`/api/cases/${ready.id}`)).json();
    expect(c.events.map((e: { message: string }) => e.message).join("\n")).toMatch(/demo account never sends real email/);
  });

  it("the demo account can't be deleted", async () => {
    const demo = new Session();
    await demo.signIn(DEMO_EMAIL, DEMO_PASSWORD_HINT);
    expect((await demo.json("/api/account", { password: DEMO_PASSWORD_HINT }, "DELETE")).status).toBe(403);
  });
});
