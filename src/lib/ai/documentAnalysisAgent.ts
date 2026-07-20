import type { Part } from "@google/genai";
import { SAFETY_PREAMBLE } from "@/lib/ai/prompts";
import { callStructuredAgent, isAiConfigured } from "@/lib/ai/callAgent";
import { documentAnalysisSchema, type DocumentAnalysisResult } from "@/lib/ai/schemas";

const fieldSchema = {
  type: "object",
  properties: {
    value: { type: ["string", "number", "null"] },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    uncertain: { type: "boolean" },
  },
  required: ["value", "confidence", "uncertain"],
};

const stringField = { ...fieldSchema, properties: { ...fieldSchema.properties, value: { type: ["string", "null"] } } };
const numberField = { ...fieldSchema, properties: { ...fieldSchema.properties, value: { type: ["number", "null"] } } };

const DOCUMENT_ANALYSIS_INPUT_SCHEMA = {
  type: "object",
  properties: {
    merchant: stringField,
    product: stringField,
    purchaseDate: stringField,
    amountCents: numberField,
    paymentMethod: stringField,
    orderNumber: stringField,
    deliveryDate: stringField,
    warrantyInfo: stringField,
    returnDeadline: stringField,
    subscriptionInfo: stringField,
    potentialIssue: stringField,
    relevantPolicyLanguage: stringField,
    missingInformation: { type: "array", items: { type: "string" } },
    documentSummary: { type: "string" },
  },
  required: [
    "merchant",
    "product",
    "purchaseDate",
    "amountCents",
    "paymentMethod",
    "orderNumber",
    "deliveryDate",
    "warrantyInfo",
    "returnDeadline",
    "subscriptionInfo",
    "potentialIssue",
    "relevantPolicyLanguage",
    "missingInformation",
    "documentSummary",
  ],
};

function emptyField() {
  return { value: null, confidence: "low" as const, uncertain: true };
}

/** Demo-mode fallback used when no GEMINI_API_KEY is configured, so the app remains usable without a key. */
function demoAnalysis(userStatedProblem?: string): DocumentAnalysisResult {
  return {
    merchant: emptyField(),
    product: emptyField(),
    purchaseDate: emptyField(),
    amountCents: emptyField(),
    paymentMethod: emptyField(),
    orderNumber: emptyField(),
    deliveryDate: emptyField(),
    warrantyInfo: emptyField(),
    returnDeadline: emptyField(),
    subscriptionInfo: emptyField(),
    potentialIssue: {
      value: userStatedProblem ?? "Not enough information to determine the issue.",
      confidence: "low",
      uncertain: true,
    },
    relevantPolicyLanguage: emptyField(),
    missingInformation: [
      "AI analysis is running in demo mode because no GEMINI_API_KEY is configured.",
      "Configure GEMINI_API_KEY to enable real document extraction.",
    ],
    documentSummary: "Demo mode: document was stored but not analyzed by AI.",
  };
}

export async function runDocumentAnalysisAgent(params: {
  bytes: Buffer;
  mimeType: string;
  userStatedProblem?: string;
}): Promise<DocumentAnalysisResult> {
  if (!isAiConfigured()) {
    return demoAnalysis(params.userStatedProblem);
  }

  const base64 = params.bytes.toString("base64");
  const documentPart: Part = { inlineData: { mimeType: params.mimeType, data: base64 } };

  const content: Part[] = [
    documentPart,
    {
      text: [
        "The attached file was uploaded by a user as a receipt, bill, order confirmation, or related document.",
        "Extract the structured fields defined by the response schema.",
        "For every field, only fill in `value` if it is clearly present in the document; otherwise leave it null and set uncertain: true.",
        "Set confidence per field based on how clearly it's stated in the document.",
        params.userStatedProblem
          ? `The user described their problem as: "${params.userStatedProblem}" (this is user-provided context, not part of the document).`
          : "The user did not provide additional context.",
      ].join("\n"),
    },
  ];

  return callStructuredAgent({
    system: SAFETY_PREAMBLE,
    content,
    inputSchema: DOCUMENT_ANALYSIS_INPUT_SCHEMA,
    zodSchema: documentAnalysisSchema,
  });
}
