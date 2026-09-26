// Safety and Accuracy Layer: deterministic checks on AI output before it is shown to the user or
// (after explicit approval) sent externally. They are simple on purpose: they complement, not
// replace, the human approval gate enforced in the approval route. They are guardrails, not a
// filter: rule-based, and a determined user editing their own draft can get past them.

import type { CertaintyLevel } from "@/lib/types";

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

// Dollar amounts as they appear in prose: $12, $12.50, $1,299.00
const DOLLAR_AMOUNT = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?/g;

export function containsUnfilledPlaceholder(text: string): boolean {
  return PLACEHOLDER_PATTERN.test(text);
}

/** Every dollar amount mentioned in the text, in cents. */
export function dollarAmountsInCents(text: string): number[] {
  return [...text.matchAll(DOLLAR_AMOUNT)].map((m) => Number(m[1].replace(/,/g, "")) * 100 + Number(m[2] ?? 0));
}

/**
 * Amounts the draft mentions that don't match any amount the pipeline actually has (the extracted
 * document total, the estimated recoverable amount). The model is told not to invent figures; this
 * catches it when it does. It can't tell a legitimately computed figure from an invented one, so a
 * hit flags the draft for review rather than blocking it.
 */
export function unsupportedAmounts(text: string, knownCents: (number | null | undefined)[]): number[] {
  const known = new Set(knownCents.filter((c): c is number => typeof c === "number"));
  return dollarAmountsInCents(text).filter((c) => !known.has(c));
}

export function reviewClaimDraft(
  body: string,
  subject: string,
  options: { knownAmountsCents?: (number | null | undefined)[] } = {},
): { flagged: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const text = `${subject}\n${body}`;
  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) reasons.push(reason);
  }
  if (containsUnfilledPlaceholder(text)) {
    reasons.push("Contains an unfilled template placeholder (e.g. \"[INSERT ...]\") — not ready to send as-is");
  }
  if (options.knownAmountsCents) {
    const unsupported = unsupportedAmounts(text, options.knownAmountsCents);
    if (unsupported.length > 0) {
      const shown = unsupported.map((c) => `$${(c / 100).toFixed(2)}`).join(", ");
      reasons.push(`Mentions an amount (${shown}) that isn't in the facts extracted from the document — check it`);
    }
  }
  return { flagged: reasons.length > 0, reasons };
}

/**
 * The research agent has no live web access and never fetches a source, so nothing it says can be a
 * confirmed policy: a model labelling something "confirmed_policy" is an unverifiable claim. Downgrade
 * those to "likely_possibility" so the UI never shows model recall as confirmed fact.
 */
export function normalizeResearchCertainty<T extends { certainty: CertaintyLevel }>(
  findings: T[],
): { findings: T[]; downgraded: number } {
  let downgraded = 0;
  const normalized = findings.map((f) => {
    if (f.certainty !== "confirmed_policy") return f;
    downgraded += 1;
    return { ...f, certainty: "likely_possibility" as const };
  });
  return { findings: normalized, downgraded };
}

/** Case Management step: what state the case lands in after analysis. */
export function decideCaseStatus(params: {
  aiConfigured: boolean;
  hasOpportunity: boolean;
  draftFlagged: boolean;
}): "ready_for_review" | "information_needed" {
  // Without a model there is no real analysis, only a placeholder: never present it as ready.
  if (!params.aiConfigured) return "information_needed";
  if (!params.hasOpportunity || params.draftFlagged) return "information_needed";
  return "ready_for_review";
}
