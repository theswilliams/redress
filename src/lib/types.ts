// Shared domain union types. Prisma models store these as plain strings
// (see prisma/schema.prisma) so the schema stays portable across databases;
// these types are the single source of truth for valid values in app code.

export const PROBLEM_CATEGORIES = [
  "refund",
  "overcharged",
  "cancel_subscription",
  "damaged_or_defective",
  "delayed_or_missing",
  "compensation",
  "not_sure",
] as const;
export type ProblemCategory = (typeof PROBLEM_CATEGORIES)[number];

export const PROBLEM_CATEGORY_LABELS: Record<ProblemCategory, string> = {
  refund: "I want a refund",
  overcharged: "I was charged too much",
  cancel_subscription: "I want to cancel something",
  damaged_or_defective: "My purchase was damaged or defective",
  delayed_or_missing: "My order was delayed or never arrived",
  compensation: "I think I am owed compensation",
  not_sure: "I'm not sure",
};

export const CASE_TYPES = [
  "refund",
  "partial_refund",
  "price_adjustment",
  "subscription_cancellation",
  "warranty_claim",
  "compensation",
  "billing_correction",
  "return",
  "service_credit",
  "unknown",
] as const;
export type CaseType = (typeof CASE_TYPES)[number];

export const CASE_TYPE_LABELS: Record<CaseType, string> = {
  refund: "Refund",
  partial_refund: "Partial refund",
  price_adjustment: "Price adjustment",
  subscription_cancellation: "Subscription cancellation",
  warranty_claim: "Warranty claim",
  compensation: "Compensation",
  billing_correction: "Billing correction",
  return: "Return",
  service_credit: "Service credit",
  unknown: "Unclear",
};

export const CASE_STATUSES = [
  "analysis_in_progress",
  "information_needed",
  "ready_for_review",
  "approved",
  "submitted",
  "awaiting_response",
  "additional_information_requested",
  "resolved",
  "rejected",
  "closed",
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  analysis_in_progress: "Analysis in progress",
  information_needed: "Information needed",
  ready_for_review: "Ready for review",
  approved: "Approved",
  submitted: "Submitted",
  awaiting_response: "Awaiting response",
  additional_information_requested: "Additional information requested",
  resolved: "Resolved",
  rejected: "Rejected",
  closed: "Closed",
};

// A case only has an outcome to record once something has actually been sent.
export const RECORDABLE_OUTCOME_STATUSES: CaseStatus[] = [
  "submitted",
  "awaiting_response",
  "additional_information_requested",
];

export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const CERTAINTY_LEVELS = [
  "confirmed_policy",
  "likely_possibility",
  "user_specific_assumption",
  "unknown",
] as const;
export type CertaintyLevel = (typeof CERTAINTY_LEVELS)[number];

export const CERTAINTY_LABELS: Record<CertaintyLevel, string> = {
  confirmed_policy: "Confirmed policy",
  likely_possibility: "Likely possibility",
  user_specific_assumption: "Assumption based on your situation",
  unknown: "Unknown",
};

export const JOB_TYPES = [
  "analyze_document",
  "detect_opportunity",
  "research_policy",
  "draft_claim",
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = ["queued", "running", "succeeded", "failed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const APPROVAL_DECISIONS = ["pending", "approved", "rejected", "edited"] as const;
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

export const OUTCOME_TYPES = ["refund", "partial_refund", "credit", "cancellation_confirmed", "no_recovery"] as const;
export type OutcomeType = (typeof OUTCOME_TYPES)[number];

export const OUTCOME_TYPE_LABELS: Record<OutcomeType, string> = {
  refund: "Full refund",
  partial_refund: "Partial refund",
  credit: "Store/service credit",
  cancellation_confirmed: "Cancellation confirmed",
  no_recovery: "No recovery",
};

/**
 * Document security state. Deliberately does NOT contain a value meaning "clean" until a real
 * malware scanner is integrated: today uploads are only validated (size, allow-listed type,
 * magic bytes), which says nothing about malicious content.
 */
export const DOCUMENT_STATUS = {
  validated: "validated", // passed size/type/signature checks; NOT malware scanned
  scannedClean: "scanned_clean", // reserved: set only by a real scanner
  quarantined: "quarantined", // reserved: set only by a real scanner
} as const;
export type DocumentStatus = (typeof DOCUMENT_STATUS)[keyof typeof DOCUMENT_STATUS];

export const ALLOWED_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

// 4 MB: Vercel rejects request bodies over ~4.5 MB before the app sees them, so a larger limit
// would only produce an opaque platform error instead of this app's clear message.
export const MAX_UPLOAD_SIZE_BYTES = 4 * 1024 * 1024;
export const MAX_UPLOAD_SIZE_LABEL = "4 MB";
