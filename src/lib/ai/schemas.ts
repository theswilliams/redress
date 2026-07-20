import { z } from "zod";

const confidence = z.enum(["low", "medium", "high"]);

const extractedField = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({
    value: valueSchema.nullable(),
    confidence,
    uncertain: z.boolean(),
  });

export const documentAnalysisSchema = z.object({
  merchant: extractedField(z.string()),
  product: extractedField(z.string()),
  purchaseDate: extractedField(z.string()),
  amountCents: extractedField(z.number().int()),
  paymentMethod: extractedField(z.string()),
  orderNumber: extractedField(z.string()),
  deliveryDate: extractedField(z.string()),
  warrantyInfo: extractedField(z.string()),
  returnDeadline: extractedField(z.string()),
  subscriptionInfo: extractedField(z.string()),
  potentialIssue: extractedField(z.string()),
  relevantPolicyLanguage: extractedField(z.string()),
  missingInformation: z.array(z.string()),
  documentSummary: z.string(),
});
export type DocumentAnalysisResult = z.infer<typeof documentAnalysisSchema>;

export const opportunitySchema = z.object({
  hasOpportunity: z.boolean(),
  caseType: z.enum([
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
  ]),
  opportunityDescription: z.string(),
  potentialAmountCents: z.number().int().nullable(),
  confidence,
  reasoning: z.string(),
  requiredNextStep: z.string(),
  missingInformation: z.array(z.string()),
});
export type OpportunityResult = z.infer<typeof opportunitySchema>;

export const policyResearchSchema = z.object({
  findings: z.array(
    z.object({
      policyType: z.enum([
        "return",
        "price_adjustment",
        "warranty",
        "shipping_guarantee",
        "subscription_cancellation",
        "compensation",
      ]),
      summary: z.string(),
      certainty: z.enum(["confirmed_policy", "likely_possibility", "user_specific_assumption", "unknown"]),
    }),
  ),
  disclaimer: z.string(),
});
export type PolicyResearchResult = z.infer<typeof policyResearchSchema>;

export const claimDraftSchema = z.object({
  subject: z.string(),
  body: z.string(),
  reasoning: z.string(),
});
export type ClaimDraftResult = z.infer<typeof claimDraftSchema>;
