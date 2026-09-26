import { describe, it, expect } from "vitest";
import {
  containsUnfilledPlaceholder,
  decideCaseStatus,
  dollarAmountsInCents,
  normalizeResearchCertainty,
  reviewClaimDraft,
  unsupportedAmounts,
} from "@/lib/ai/safetyLayer";

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

describe("normalizeResearchCertainty", () => {
  it("never lets model recall appear as a confirmed policy (no source is ever checked)", () => {
    const { findings, downgraded } = normalizeResearchCertainty([
      { certainty: "confirmed_policy" as const, summary: "30-day returns" },
      { certainty: "likely_possibility" as const, summary: "price matching" },
      { certainty: "unknown" as const, summary: "?" },
    ]);
    expect(findings.map((f) => f.certainty)).toEqual(["likely_possibility", "likely_possibility", "unknown"]);
    expect(downgraded).toBe(1);
    expect(findings[0].summary).toBe("30-day returns");
  });
});

describe("amount checks", () => {
  it("reads dollar amounts in common formats", () => {
    expect(dollarAmountsInCents("paid $1,299.00, then $19.99 and $5")).toEqual([129900, 1999, 500]);
  });

  it("reports amounts that are not among the known figures", () => {
    expect(unsupportedAmounts("I was charged $19.99 twice; please refund $19.99.", [3998, 1999])).toEqual([]);
    expect(unsupportedAmounts("Please refund $250.00.", [19900, null])).toEqual([25000]);
  });

  it("flags a draft that mentions an amount the document doesn't support", () => {
    const r = reviewClaimDraft("Please refund the $500.00 I paid.", "Refund", { knownAmountsCents: [4999, null] });
    expect(r.flagged).toBe(true);
    expect(r.reasons.join(" ")).toMatch(/\$500\.00/);
  });
});

describe("decideCaseStatus", () => {
  it("is ready for review only with a real analysis, an opportunity and a clean draft", () => {
    expect(decideCaseStatus({ aiConfigured: true, hasOpportunity: true, draftFlagged: false })).toBe("ready_for_review");
    expect(decideCaseStatus({ aiConfigured: true, hasOpportunity: false, draftFlagged: false })).toBe("information_needed");
    expect(decideCaseStatus({ aiConfigured: true, hasOpportunity: true, draftFlagged: true })).toBe("information_needed");
  });

  it("never presents a demo-mode placeholder analysis as ready", () => {
    expect(decideCaseStatus({ aiConfigured: false, hasOpportunity: true, draftFlagged: false })).toBe("information_needed");
  });
});
