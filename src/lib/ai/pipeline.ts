import { db } from "@/lib/db";
import { readUpload } from "@/lib/storage";
import { runDocumentAnalysisAgent } from "@/lib/ai/documentAnalysisAgent";
import { runOpportunityDetectionAgent } from "@/lib/ai/opportunityDetectionAgent";
import { runResearchAgent } from "@/lib/ai/researchAgent";
import { runClaimDraftingAgent } from "@/lib/ai/claimDraftingAgent";
import { reviewClaimDraft, reviewResearchCertainty } from "@/lib/ai/safetyLayer";
import { isAiConfigured } from "@/lib/ai/callAgent";
import type { ProblemCategory } from "@/lib/types";

function parseLooseDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Runs the full Document Analysis -> Opportunity Detection -> Research ->
 * Claim Drafting chain for a single document, persisting each agent's output
 * as an AIAnalysis row (for traceability), plus derived Transaction,
 * PolicySource, and a draft Communication + pending UserApproval. The case
 * never leaves "analysis_in_progress" and no Communication is ever created
 * with a status other than "draft" as part of this pipeline — sending
 * requires a separate, explicit user approval (see
 * app/api/cases/[caseId]/approve/route.ts).
 */
export async function runAnalysisPipeline(caseId: string, documentId: string) {
  const [caseRecord, document] = await Promise.all([
    db.case.findUniqueOrThrow({ where: { id: caseId } }),
    db.document.findUniqueOrThrow({ where: { id: documentId } }),
  ]);

  const bytes = await readUpload(document.storageKey);

  // 1. Document Analysis Agent
  const documentAnalysis = await runDocumentAnalysisAgent({
    bytes,
    mimeType: document.mimeType,
    userStatedProblem: caseRecord.userStatedProblem ?? undefined,
  });

  await db.aIAnalysis.create({
    data: {
      caseId,
      documentId,
      agent: "document_analysis",
      input: JSON.stringify({ mimeType: document.mimeType, fileName: document.fileName }),
      output: JSON.stringify(documentAnalysis),
      confidence: "medium",
    },
  });

  if (documentAnalysis.amountCents.value !== null || documentAnalysis.merchant.value !== null) {
    await db.transaction.create({
      data: {
        caseId,
        merchant: documentAnalysis.merchant.value ?? undefined,
        product: documentAnalysis.product.value ?? undefined,
        purchaseDate: parseLooseDate(documentAnalysis.purchaseDate.value),
        amountCents: documentAnalysis.amountCents.value ?? undefined,
        paymentMethod: documentAnalysis.paymentMethod.value ?? undefined,
        orderNumber: documentAnalysis.orderNumber.value ?? undefined,
        deliveryDate: parseLooseDate(documentAnalysis.deliveryDate.value),
        source: "ai_extracted",
        confidence: documentAnalysis.merchant.confidence,
      },
    });
  }

  // 2. Opportunity Detection Agent
  const opportunity = await runOpportunityDetectionAgent({
    problemCategory: caseRecord.problemCategory as ProblemCategory,
    userStatedProblem: caseRecord.userStatedProblem ?? undefined,
    documentAnalysis,
  });

  await db.aIAnalysis.create({
    data: {
      caseId,
      documentId,
      agent: "opportunity_detection",
      input: JSON.stringify({ problemCategory: caseRecord.problemCategory }),
      output: JSON.stringify(opportunity),
      confidence: opportunity.confidence,
    },
  });

  // 3. Research Agent
  const research = await runResearchAgent({
    merchant: documentAnalysis.merchant.value,
    opportunity,
  });

  const researchReview = reviewResearchCertainty(research.findings);

  await db.aIAnalysis.create({
    data: {
      caseId,
      documentId,
      agent: "research",
      input: JSON.stringify({ merchant: documentAnalysis.merchant.value }),
      output: JSON.stringify(research),
      flaggedForReview: researchReview.flagged,
      flagReason: researchReview.reasons.join("; ") || undefined,
    },
  });

  for (const finding of research.findings) {
    await db.policySource.create({
      data: {
        caseId,
        merchant: documentAnalysis.merchant.value ?? undefined,
        policyType: finding.policyType,
        excerpt: finding.summary,
        certainty: finding.certainty,
      },
    });
  }

  // 4. Claim Drafting Agent
  const draft = await runClaimDraftingAgent({
    merchant: documentAnalysis.merchant.value,
    documentAnalysis,
    opportunity,
    research,
  });

  const draftReview = reviewClaimDraft(draft.body, draft.subject);

  await db.aIAnalysis.create({
    data: {
      caseId,
      documentId,
      agent: "claim_drafting",
      input: JSON.stringify({ opportunityCaseType: opportunity.caseType }),
      output: JSON.stringify(draft),
      flaggedForReview: draftReview.flagged,
      flagReason: draftReview.reasons.join("; ") || undefined,
    },
  });

  const communication = await db.communication.create({
    data: {
      caseId,
      direction: "outbound",
      channel: "email",
      subject: draft.subject,
      body: draft.body,
      draftedBy: "ai",
      status: "draft",
    },
  });

  const approval = await db.userApproval.create({
    data: {
      userId: caseRecord.userId,
      caseId,
      actionType: "submit_claim",
      proposedAction: JSON.stringify({
        communicationId: communication.id,
        summary: opportunity.opportunityDescription,
      }),
      decision: "pending",
    },
  });

  await db.communication.update({ where: { id: communication.id }, data: { approvalId: approval.id } });

  // 5. Case Management Agent: decide the case's next status and headline fields.
  const nextStatus =
    !opportunity.hasOpportunity || draftReview.flagged || researchReview.flagged
      ? "information_needed"
      : "ready_for_review";

  await db.case.update({
    where: { id: caseId },
    data: {
      merchant: documentAnalysis.merchant.value ?? caseRecord.merchant,
      caseType: opportunity.caseType,
      originalAmountCents: documentAnalysis.amountCents.value ?? caseRecord.originalAmountCents,
      potentialRecoveryCents: opportunity.potentialAmountCents ?? caseRecord.potentialRecoveryCents,
      confidenceLevel: opportunity.confidence,
      status: nextStatus,
      requiredAction: opportunity.requiredNextStep,
    },
  });

  await db.caseEvent.create({
    data: {
      caseId,
      type: "ai_analysis",
      message: isAiConfigured()
        ? `Redress analyzed your document and found a possible ${opportunity.caseType.replace(/_/g, " ")} opportunity.`
        : "Analysis ran in demo mode (no GEMINI_API_KEY configured) — connect an API key for real analysis.",
      metadata: JSON.stringify({ opportunity, flagged: draftReview.flagged || researchReview.flagged }),
    },
  });

  await db.caseEvent.create({
    data: {
      caseId,
      type: "status_change",
      message: `Case status set to "${nextStatus.replace(/_/g, " ")}".`,
    },
  });
}
