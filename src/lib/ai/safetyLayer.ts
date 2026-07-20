// Safety and Accuracy Layer: a final rule-based check on AI output before it
// is shown to the user or (after explicit approval) sent externally. This is
// deliberately simple and deterministic — it complements, not replaces, the
// human approval gate that's enforced at the data layer.

const FORBIDDEN_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\b(sue|lawsuit|legal action|court)\b/i, reason: "Mentions legal action/lawsuits" },
  { pattern: /\bi am a lawyer\b|\bas your attorney\b/i, reason: "Implies legal representation" },
  { pattern: /\byou are legally entitled\b|\byou have a legal right\b/i, reason: "States a definitive legal right" },
  { pattern: /\bguarantee(d)?\b/i, reason: "Uses guarantee language" },
  { pattern: /\bor else\b|\bimmediately or\b/i, reason: "Reads as a threat" },
];

// Matches unfilled template placeholders like "[INSERT YOUR ISSUE HERE]" or
// "[insert order number]" that the model sometimes leaves in a draft when it
// couldn't determine a concrete detail (e.g. no problem was described).
// A draft containing one of these is not actually ready to send.
const PLACEHOLDER_PATTERN = /\[(?:insert|fill in|your |e\.g\.|specify|describe|add )[^\]]*\]/i;

export function containsUnfilledPlaceholder(text: string): boolean {
  return PLACEHOLDER_PATTERN.test(text);
}

export function reviewClaimDraft(body: string, subject: string): { flagged: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const text = `${subject}\n${body}`;
  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) reasons.push(reason);
  }
  if (containsUnfilledPlaceholder(text)) {
    reasons.push("Contains an unfilled template placeholder (e.g. \"[INSERT ...]\") — not ready to send as-is");
  }
  return { flagged: reasons.length > 0, reasons };
}

export function reviewResearchCertainty(findings: { certainty: string }[]): { flagged: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const confirmedCount = findings.filter((f) => f.certainty === "confirmed_policy").length;
  if (confirmedCount > 2) {
    reasons.push("Unusually many findings marked as confirmed policy — recommend human review.");
  }
  return { flagged: reasons.length > 0, reasons };
}
