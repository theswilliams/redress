import { describe, it, expect } from "vitest";
import { reviewClaimDraft, reviewResearchCertainty, containsUnfilledPlaceholder } from "@/lib/ai/safetyLayer";

describe("reviewClaimDraft", () => {
  it("passes a clean, factual draft", () => {
    const result = reviewClaimDraft(
      "I noticed the price dropped after my purchase and would appreciate a price adjustment if your policy allows it.",
      "Price adjustment request for order #12345",
    );
    expect(result.flagged).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });

  it("flags language that threatens legal action", () => {
    const result = reviewClaimDraft("If you don't resolve this I will sue.", "Refund demand");
    expect(result.flagged).toBe(true);
    expect(result.reasons.some((r) => /legal action/i.test(r))).toBe(true);
  });

  it("flags claims of guaranteed legal entitlement", () => {
    const result = reviewClaimDraft("You have a legal right to refund me immediately.", "Refund");
    expect(result.flagged).toBe(true);
  });

  it("flags impersonation of legal counsel", () => {
    const result = reviewClaimDraft("As your attorney, I demand action.", "Notice");
    expect(result.flagged).toBe(true);
  });

  it("flags an unfilled template placeholder left in the draft", () => {
    const result = reviewClaimDraft(
      "I am reaching out because [INSERT YOUR SPECIFIC ISSUE HERE - E.G., THE PRODUCT IS DEFECTIVE].",
      "Inquiry about my order",
    );
    expect(result.flagged).toBe(true);
    expect(result.reasons.some((r) => /placeholder/i.test(r))).toBe(true);
  });
});

describe("containsUnfilledPlaceholder", () => {
  it("detects bracketed instruction placeholders", () => {
    expect(containsUnfilledPlaceholder("Reason: [insert your reason here]")).toBe(true);
    expect(containsUnfilledPlaceholder("Details: [describe the issue]")).toBe(true);
  });

  it("does not flag ordinary text containing brackets", () => {
    expect(containsUnfilledPlaceholder("The item [HP Pavilion Laptop] arrived damaged.")).toBe(false);
  });

  it("does not flag clean text with no brackets at all", () => {
    expect(containsUnfilledPlaceholder("I would like to request a refund for order #12345.")).toBe(false);
  });
});

describe("reviewResearchCertainty", () => {
  it("does not flag a small number of confirmed findings", () => {
    const result = reviewResearchCertainty([
      { certainty: "confirmed_policy" },
      { certainty: "likely_possibility" },
    ]);
    expect(result.flagged).toBe(false);
  });

  it("flags an unusually high number of confirmed findings for human review", () => {
    const result = reviewResearchCertainty([
      { certainty: "confirmed_policy" },
      { certainty: "confirmed_policy" },
      { certainty: "confirmed_policy" },
    ]);
    expect(result.flagged).toBe(true);
  });
});
