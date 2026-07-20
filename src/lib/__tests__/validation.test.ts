import { describe, it, expect } from "vitest";
import { signUpSchema, newCaseSchema, approvalDecisionSchema } from "@/lib/validation";

describe("signUpSchema", () => {
  it("accepts a valid signup", () => {
    const result = signUpSchema.safeParse({ name: "Jane Doe", email: "jane@example.com", password: "password123" });
    expect(result.success).toBe(true);
  });

  it("rejects a short password", () => {
    const result = signUpSchema.safeParse({ name: "Jane", email: "jane@example.com", password: "short" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = signUpSchema.safeParse({ name: "Jane", email: "not-an-email", password: "password123" });
    expect(result.success).toBe(false);
  });

  it("lowercases and trims the email", () => {
    const result = signUpSchema.safeParse({ name: "Jane", email: "  Jane@Example.COM  ", password: "password123" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("jane@example.com");
  });
});

describe("newCaseSchema", () => {
  it("accepts a known problem category", () => {
    const result = newCaseSchema.safeParse({ problemCategory: "refund" });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown problem category", () => {
    const result = newCaseSchema.safeParse({ problemCategory: "made_up_category" });
    expect(result.success).toBe(false);
  });
});

describe("approvalDecisionSchema", () => {
  it("accepts a valid decision", () => {
    const result = approvalDecisionSchema.safeParse({ decision: "approved" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid decision value", () => {
    const result = approvalDecisionSchema.safeParse({ decision: "maybe" });
    expect(result.success).toBe(false);
  });
});
