// Seed data for the shared public demo account: four example cases, one at each stage of the
// lifecycle (ready for review, awaiting response, rejected, resolved), with small generated PDFs.
// Used by scripts/seed-demo.ts and by the scheduled reset (app/api/cron/reset-demo).
//
// Writes directly to the database and to storage — it does NOT go through the app's HTTP routes, so
// it bypasses rate limiting and the upload endpoint's checks (the PDFs it builds are valid, so nothing
// downstream breaks). Needs no AI calls.

import bcrypt from "bcryptjs";
import type { PrismaClient } from "@/generated/prisma/client";
import { saveUpload, deleteAllUploadsForUser } from "@/lib/storage";
import { DEMO_EMAIL, DEMO_PASSWORD_HINT } from "@/lib/demo";

const MODEL = "gemini-flash-latest";

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

/** Builds a small, valid single-page PDF containing the given lines of text. */
function buildPdf(lines: string[]): Buffer {
  const content = [
    "BT",
    "/F1 12 Tf",
    "14 TL",
    "72 740 Td",
    ...lines.map((line, i) => `${i === 0 ? "" : "T*\n"}(${line.replace(/[()\\]/g, "\\$&")}) Tj`),
    "ET",
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "utf-8")} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, "utf-8"));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf, "utf-8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "utf-8");
}

async function uploadDemoDoc(userId: string, fileName: string, lines: string[]) {
  const bytes = buildPdf(lines);
  return saveUpload({ userId, fileName, bytes });
}

/**
 * Resets the shared demo account to its seeded state: removes every case, document and uploaded file
 * on it (including anything visitors added), then recreates four example cases.
 *
 * The user row itself is kept (same id), so visitors who are signed in when a reset runs keep a
 * working session. Idempotent.
 */
export async function seedDemoAccount(db: PrismaClient, log: (msg: string) => void = () => {}): Promise<void> {
  log(`Seeding demo account: ${DEMO_EMAIL}`);

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD_HINT, 12);
  const existing = await db.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    log("Existing demo user found — clearing its uploaded files, documents and cases.");
    await deleteAllUploadsForUser(existing.id);
    await db.document.deleteMany({ where: { userId: existing.id } });
    await db.case.deleteMany({ where: { userId: existing.id } }); // cascades to events, drafts, approvals, jobs
    await db.user.update({
      where: { id: existing.id },
      data: { passwordHash, name: "Alex (Demo)", emailVerifiedAt: daysAgo(30) },
    });
  }

  const user =
    existing ??
    (await db.user.create({
    data: {
      email: DEMO_EMAIL,
      passwordHash,
      name: "Alex (Demo)",
      emailVerifiedAt: daysAgo(30),
      createdAt: daysAgo(30),
    },
  }));

  // ---------------------------------------------------------------------
  // Case 1 — Comfort Airlines: resolved compensation claim
  // ---------------------------------------------------------------------
  {
    const created = daysAgo(21);
    const doc = await uploadDemoDoc(user.id, "boarding_pass_and_receipt.pdf", [
      "Comfort Airlines — E-Ticket Receipt",
      "Confirmation: CA-88213",
      "Flight CA482  BOS -> ORD",
      "Passenger: A. Demo",
      "Fare paid: $418.00 (Visa ...4432)",
      "STATUS: CANCELLED — rebooked next available flight",
    ]);

    const caseRecord = await db.case.create({
      data: {
        userId: user.id,
        merchant: "Comfort Airlines",
        caseType: "compensation",
        problemCategory: "compensation",
        userStatedProblem:
          "My flight CA482 from Boston to Chicago was cancelled with less than 12 hours' notice and I had to book a same-day replacement out of pocket.",
        originalAmountCents: 41800,
        potentialRecoveryCents: 40000,
        confirmedRecoveryCents: 40000,
        currency: "USD",
        confidenceLevel: "high",
        status: "resolved",
        createdAt: created,
        updatedAt: daysAgo(6),
      },
    });

    // saveUpload only writes the bytes to storage — create the Document row ourselves.
    const document = await db.document.create({
      data: {
        userId: user.id,
        caseId: caseRecord.id,
        fileName: "boarding_pass_and_receipt.pdf",
        storageKey: doc.storageKey,
        mimeType: "application/pdf",
        sizeBytes: doc.sizeBytes,
        sha256: doc.sha256,
        securityStatus: "validated",
        createdAt: created,
      },
    });

    await db.transaction.create({
      data: {
        caseId: caseRecord.id,
        merchant: "Comfort Airlines",
        product: "Flight CA482 (BOS → ORD)",
        purchaseDate: daysAgo(23),
        amountCents: 41800,
        currency: "USD",
        paymentMethod: "Visa ending 4432",
        orderNumber: "CA-88213",
        source: "ai_extracted",
        confidence: "high",
        createdAt: created,
      },
    });

    await db.aIAnalysis.createMany({
      data: [
        {
          caseId: caseRecord.id,
          documentId: document.id,
          agent: "document_analysis",
          input: JSON.stringify({ documentId: document.id, fileName: "boarding_pass_and_receipt.pdf" }),
          output: JSON.stringify({
            merchant: "Comfort Airlines",
            amountCents: 41800,
            orderNumber: "CA-88213",
            flightStatus: "cancelled",
            confidence: "high",
          }),
          model: MODEL,
          confidence: "high",
          createdAt: daysAgo(21),
        },
        {
          caseId: caseRecord.id,
          agent: "opportunity_detection",
          input: JSON.stringify({ caseType: "unknown", extractedFacts: "flight cancelled < 12h before departure" }),
          output: JSON.stringify({
            caseType: "compensation",
            reasoning:
              "Airline-initiated cancellation inside 14 days of departure with no substitute offered in time typically qualifies for cash/travel-credit compensation under most US carriers' contracts of carriage.",
            potentialRecoveryCents: 40000,
          }),
          model: MODEL,
          confidence: "high",
          createdAt: daysAgo(20),
        },
        {
          caseId: caseRecord.id,
          agent: "research",
          input: JSON.stringify({ merchant: "Comfort Airlines", policyType: "compensation" }),
          output: JSON.stringify({
            certainty: "confirmed_policy",
            excerpt:
              "Comfort Airlines' Contract of Carriage, Rule 240: passengers affected by an airline-initiated cancellation within 12 hours of scheduled departure are entitled to a travel credit equal to the fare paid, or cash compensation on request.",
          }),
          model: MODEL,
          confidence: "high",
          createdAt: daysAgo(20),
        },
        {
          caseId: caseRecord.id,
          agent: "claim_drafting",
          input: JSON.stringify({ caseType: "compensation", facts: "see transaction + policy" }),
          output: JSON.stringify({ subject: "Compensation request — Flight CA482, Confirmation CA-88213" }),
          model: MODEL,
          confidence: "high",
          createdAt: daysAgo(20),
        },
      ],
    });

    await db.policySource.create({
      data: {
        caseId: caseRecord.id,
        merchant: "Comfort Airlines",
        policyType: "compensation",
        url: "https://comfortairlines.example/legal/contract-of-carriage",
        excerpt:
          "Rule 240: passengers affected by an airline-initiated cancellation within 12 hours of scheduled departure are entitled to a travel credit equal to the fare paid, or cash compensation on request.",
        certainty: "confirmed_policy",
        accessedAt: daysAgo(20),
        createdAt: daysAgo(20),
      },
    });

    const communication = await db.communication.create({
      data: {
        caseId: caseRecord.id,
        direction: "outbound",
        channel: "email",
        recipientEmail: "claims@comfortairlines.example",
        subject: "Compensation request — Flight CA482, Confirmation CA-88213",
        body:
          "Hello,\n\nI'm writing regarding Flight CA482 (Boston to Chicago) on my reservation CA-88213, which Comfort Airlines cancelled with less than 12 hours' notice before scheduled departure.\n\n" +
          "Per Rule 240 of Comfort Airlines' Contract of Carriage, I'm requesting the compensation owed for an airline-initiated cancellation inside the 12-hour window: a travel credit or cash payment equal to my $418.00 fare.\n\n" +
          "I had to book a same-day replacement flight out of pocket to make an important commitment in Chicago, so a prompt response would be appreciated. I've attached my original receipt and confirmation for reference.\n\n" +
          "Thank you,\nAlex",
        draftedBy: "ai",
        status: "sent",
        createdAt: daysAgo(19),
        sentAt: daysAgo(19),
      },
    });

    const approval = await db.userApproval.create({
      data: {
        userId: user.id,
        caseId: caseRecord.id,
        actionType: "submit_claim",
        proposedAction: JSON.stringify({
          summary: "Send a compensation request to Comfort Airlines for the cancelled flight, citing Rule 240.",
          communicationId: communication.id,
        }),
        decision: "approved",
        decidedAt: daysAgo(19),
        createdAt: daysAgo(19),
      },
    });
    await db.communication.update({ where: { id: communication.id }, data: { approvalId: approval.id } });

    await db.recoveryOutcome.create({
      data: {
        caseId: caseRecord.id,
        outcomeType: "credit",
        recoveredCents: 40000,
        currency: "USD",
        resolvedAt: daysAgo(6),
        notes: "Comfort Airlines issued a $400 travel credit within 5 business days of the request.",
        createdAt: daysAgo(6),
      },
    });

    await db.caseEvent.createMany({
      data: [
        { caseId: caseRecord.id, type: "document_added", message: "Uploaded boarding_pass_and_receipt.pdf.", createdAt: daysAgo(21) },
        { caseId: caseRecord.id, type: "ai_analysis", message: "Redress identified this as a likely compensation claim (high confidence).", createdAt: daysAgo(20) },
        { caseId: caseRecord.id, type: "ai_analysis", message: "Found a matching airline policy: cancellations inside 12 hours qualify for compensation.", createdAt: daysAgo(20) },
        { caseId: caseRecord.id, type: "approval", message: "You approved and sent the compensation request to Comfort Airlines.", createdAt: daysAgo(19) },
        { caseId: caseRecord.id, type: "status_change", message: "Comfort Airlines issued a $400 travel credit. Case marked resolved.", createdAt: daysAgo(6) },
      ],
    });
  }

  // ---------------------------------------------------------------------
  // Case 2 — StreamFlix: awaiting response on a duplicate charge
  // ---------------------------------------------------------------------
  {
    const created = daysAgo(9);
    const doc = await uploadDemoDoc(user.id, "streamflix_statement.pdf", [
      "StreamFlix — Billing Statement",
      "Account: alex@example.com",
      "03/14  StreamFlix Premium  $19.99",
      "03/14  StreamFlix Premium  $19.99",
      "Total charged this cycle: $39.98",
    ]);

    const caseRecord = await db.case.create({
      data: {
        userId: user.id,
        merchant: "StreamFlix",
        caseType: "billing_correction",
        problemCategory: "overcharged",
        userStatedProblem:
          "I was charged twice for my StreamFlix Premium plan on the same day — $19.99 twice on the same statement.",
        originalAmountCents: 3998,
        potentialRecoveryCents: 1999,
        currency: "USD",
        confidenceLevel: "high",
        status: "awaiting_response",
        requiredAction:
          "Waiting on StreamFlix to respond to the refund request sent 4 days ago. If there's no reply within 5 business days, Redress will suggest disputing the duplicate charge with your card issuer instead.",
        createdAt: created,
        updatedAt: daysAgo(4),
      },
    });

    const document = await db.document.create({
      data: {
        userId: user.id,
        caseId: caseRecord.id,
        fileName: "streamflix_statement.pdf",
        storageKey: doc.storageKey,
        mimeType: "application/pdf",
        sizeBytes: doc.sizeBytes,
        sha256: doc.sha256,
        securityStatus: "validated",
        createdAt: created,
      },
    });

    await db.transaction.create({
      data: {
        caseId: caseRecord.id,
        merchant: "StreamFlix",
        product: "Premium Plan (Monthly)",
        purchaseDate: daysAgo(11),
        amountCents: 1999,
        currency: "USD",
        orderNumber: "SF-2026-0314-2",
        source: "ai_extracted",
        confidence: "high",
        createdAt: created,
      },
    });

    await db.aIAnalysis.createMany({
      data: [
        {
          caseId: caseRecord.id,
          documentId: document.id,
          agent: "document_analysis",
          input: JSON.stringify({ documentId: document.id }),
          output: JSON.stringify({ merchant: "StreamFlix", duplicateChargeDetected: true, amountEachCents: 1999 }),
          model: MODEL,
          confidence: "high",
          createdAt: daysAgo(9),
        },
        {
          caseId: caseRecord.id,
          agent: "opportunity_detection",
          input: JSON.stringify({ extractedFacts: "two identical $19.99 charges same day" }),
          output: JSON.stringify({ caseType: "billing_correction", potentialRecoveryCents: 1999 }),
          model: MODEL,
          confidence: "high",
          createdAt: daysAgo(9),
        },
        {
          caseId: caseRecord.id,
          agent: "claim_drafting",
          input: JSON.stringify({ caseType: "billing_correction" }),
          output: JSON.stringify({ subject: "Duplicate charge on account — refund request" }),
          model: MODEL,
          confidence: "high",
          createdAt: daysAgo(8),
        },
      ],
    });

    const communication = await db.communication.create({
      data: {
        caseId: caseRecord.id,
        direction: "outbound",
        channel: "email",
        recipientEmail: "billing@streamflix.example",
        subject: "Duplicate charge on account — refund request",
        body:
          "Hi,\n\nMy latest statement shows two identical charges of $19.99 for my StreamFlix Premium plan on the same day (03/14), instead of the usual single monthly charge.\n\n" +
          "Could you please refund the duplicate charge of $19.99? I've attached a copy of the statement showing both charges. Happy to provide any other account details you need.\n\n" +
          "Thanks,\nAlex",
        draftedBy: "ai",
        status: "sent",
        createdAt: daysAgo(4),
        sentAt: daysAgo(4),
      },
    });

    const approval = await db.userApproval.create({
      data: {
        userId: user.id,
        caseId: caseRecord.id,
        actionType: "request_refund",
        proposedAction: JSON.stringify({
          summary: "Ask StreamFlix to refund the duplicate $19.99 charge from this billing cycle.",
          communicationId: communication.id,
        }),
        decision: "approved",
        decidedAt: daysAgo(4),
        createdAt: daysAgo(4),
      },
    });
    await db.communication.update({ where: { id: communication.id }, data: { approvalId: approval.id } });

    await db.caseEvent.createMany({
      data: [
        { caseId: caseRecord.id, type: "document_added", message: "Uploaded streamflix_statement.pdf.", createdAt: daysAgo(9) },
        { caseId: caseRecord.id, type: "ai_analysis", message: "Redress spotted a duplicate charge for the same plan on the same day.", createdAt: daysAgo(9) },
        { caseId: caseRecord.id, type: "approval", message: "You approved and sent the refund request to StreamFlix.", createdAt: daysAgo(4) },
        { caseId: caseRecord.id, type: "system", message: "Marked as awaiting a response from StreamFlix.", createdAt: daysAgo(4) },
      ],
    });
  }

  // ---------------------------------------------------------------------
  // Case 3 — GadgetHub: ready for review (shows the approval gate)
  // ---------------------------------------------------------------------
  {
    const created = daysAgo(1);
    const doc = await uploadDemoDoc(user.id, "laptop_invoice.pdf", [
      "GadgetHub — Order Confirmation",
      "Order: GH-550219",
      "Zenbook Pro 14 Laptop",
      "Purchased: 3 months ago",
      "Total: $1,299.00",
      "Manufacturer warranty: 1 year",
    ]);

    const caseRecord = await db.case.create({
      data: {
        userId: user.id,
        merchant: "GadgetHub",
        caseType: "warranty_claim",
        problemCategory: "damaged_or_defective",
        userStatedProblem:
          "The laptop I bought 3 months ago has a swollen battery and won't hold a charge. It's still within the 1-year manufacturer warranty.",
        originalAmountCents: 129900,
        potentialRecoveryCents: 129900,
        currency: "USD",
        confidenceLevel: "medium",
        status: "ready_for_review",
        requiredAction: "Review the drafted warranty claim below and approve it to send it to GadgetHub, or add more information if anything looks off.",
        createdAt: created,
        updatedAt: created,
      },
    });

    const document = await db.document.create({
      data: {
        userId: user.id,
        caseId: caseRecord.id,
        fileName: "laptop_invoice.pdf",
        storageKey: doc.storageKey,
        mimeType: "application/pdf",
        sizeBytes: doc.sizeBytes,
        sha256: doc.sha256,
        securityStatus: "validated",
        createdAt: created,
      },
    });

    await db.transaction.create({
      data: {
        caseId: caseRecord.id,
        merchant: "GadgetHub",
        product: "Zenbook Pro 14 laptop",
        purchaseDate: daysAgo(92),
        amountCents: 129900,
        currency: "USD",
        orderNumber: "GH-550219",
        source: "ai_extracted",
        confidence: "high",
        createdAt: created,
      },
    });

    await db.aIAnalysis.createMany({
      data: [
        {
          caseId: caseRecord.id,
          documentId: document.id,
          agent: "document_analysis",
          input: JSON.stringify({ documentId: document.id }),
          output: JSON.stringify({ merchant: "GadgetHub", amountCents: 129900, warrantyMonths: 12, purchaseAgeMonths: 3 }),
          model: MODEL,
          confidence: "high",
          createdAt: created,
        },
        {
          caseId: caseRecord.id,
          agent: "opportunity_detection",
          input: JSON.stringify({ extractedFacts: "battery defect, 3 months old, 1yr warranty" }),
          output: JSON.stringify({ caseType: "warranty_claim", potentialRecoveryCents: 129900, confidence: "medium" }),
          model: MODEL,
          confidence: "medium",
          flaggedForReview: false,
          createdAt: created,
        },
        {
          caseId: caseRecord.id,
          agent: "research",
          input: JSON.stringify({ merchant: "GadgetHub", policyType: "warranty" }),
          output: JSON.stringify({
            certainty: "likely_possibility",
            excerpt: "GadgetHub's product pages advertise a 1-year manufacturer warranty covering defects, but the exact claims process wasn't independently verified for this SKU.",
          }),
          model: MODEL,
          confidence: "medium",
          createdAt: created,
        },
        {
          caseId: caseRecord.id,
          agent: "claim_drafting",
          input: JSON.stringify({ caseType: "warranty_claim" }),
          output: JSON.stringify({ subject: "Warranty claim — Zenbook Pro 14 (Order GH-550219)" }),
          model: MODEL,
          confidence: "medium",
          createdAt: created,
        },
      ],
    });

    await db.policySource.create({
      data: {
        caseId: caseRecord.id,
        merchant: "GadgetHub",
        policyType: "warranty",
        url: "https://gadgethub.example/support/warranty",
        excerpt:
          "GadgetHub laptops carry a 1-year manufacturer warranty covering defects in materials and workmanship, including battery failures, at no cost to the customer.",
        certainty: "likely_possibility",
        accessedAt: created,
        createdAt: created,
      },
    });

    const communication = await db.communication.create({
      data: {
        caseId: caseRecord.id,
        direction: "outbound",
        channel: "email",
        recipientEmail: null,
        subject: "Warranty claim — Zenbook Pro 14 (Order GH-550219)",
        body:
          "Hello,\n\nI'm reaching out about a defect with the Zenbook Pro 14 laptop from order GH-550219, purchased about 3 months ago. The battery has become swollen and no longer holds a charge.\n\n" +
          "Since this is within the 1-year manufacturer warranty, I'd like to request a repair or replacement under that warranty. Please let me know the next steps — I'm happy to provide photos or ship the unit in if needed.\n\n" +
          "Thank you,\nAlex",
        draftedBy: "ai",
        status: "draft",
        createdAt: created,
      },
    });

    await db.userApproval.create({
      data: {
        userId: user.id,
        caseId: caseRecord.id,
        actionType: "submit_claim",
        proposedAction: JSON.stringify({
          summary: "Send a warranty claim to GadgetHub for the swollen battery — still within the 1-year warranty window.",
          communicationId: communication.id,
        }),
        decision: "pending",
        createdAt: created,
      },
    });

    await db.caseEvent.createMany({
      data: [
        { caseId: caseRecord.id, type: "document_added", message: "Uploaded laptop_invoice.pdf.", createdAt: created },
        { caseId: caseRecord.id, type: "ai_analysis", message: "Redress identified this as a likely warranty claim (medium confidence) and drafted a claim for your review.", createdAt: created },
      ],
    });
  }

  // ---------------------------------------------------------------------
  // Case 4 — QuickMart: submitted, but ultimately no recovery
  // ---------------------------------------------------------------------
  {
    const created = daysAgo(15);
    const doc = await uploadDemoDoc(user.id, "quickmart_receipt.pdf", [
      "QuickMart Grocery — Receipt",
      "Store #4471",
      "Organic Olive Oil 1L   $24.99",
      "Total: $24.99",
    ]);

    const caseRecord = await db.case.create({
      data: {
        userId: user.id,
        merchant: "QuickMart Grocery",
        caseType: "price_adjustment",
        problemCategory: "overcharged",
        userStatedProblem:
          "I was charged full price for an item that had a sale tag on the shelf when I picked it up.",
        originalAmountCents: 2499,
        potentialRecoveryCents: 800,
        confirmedRecoveryCents: 0,
        currency: "USD",
        confidenceLevel: "low",
        status: "rejected",
        createdAt: created,
        updatedAt: daysAgo(10),
      },
    });

    const document = await db.document.create({
      data: {
        userId: user.id,
        caseId: caseRecord.id,
        fileName: "quickmart_receipt.pdf",
        storageKey: doc.storageKey,
        mimeType: "application/pdf",
        sizeBytes: doc.sizeBytes,
        sha256: doc.sha256,
        securityStatus: "validated",
        createdAt: created,
      },
    });

    await db.transaction.create({
      data: {
        caseId: caseRecord.id,
        merchant: "QuickMart Grocery",
        product: "Organic Olive Oil 1L",
        purchaseDate: daysAgo(16),
        amountCents: 2499,
        currency: "USD",
        source: "ai_extracted",
        confidence: "low",
        createdAt: created,
      },
    });

    await db.aIAnalysis.createMany({
      data: [
        {
          caseId: caseRecord.id,
          documentId: document.id,
          agent: "document_analysis",
          input: JSON.stringify({ documentId: document.id }),
          output: JSON.stringify({ merchant: "QuickMart Grocery", amountCents: 2499 }),
          model: MODEL,
          confidence: "medium",
          createdAt: created,
        },
        {
          caseId: caseRecord.id,
          agent: "opportunity_detection",
          input: JSON.stringify({ extractedFacts: "user reports a shelf sale tag not reflected on receipt" }),
          output: JSON.stringify({
            caseType: "price_adjustment",
            potentialRecoveryCents: 800,
            confidence: "low",
            note: "No photo of the shelf tag was provided, so this rests entirely on the user's account of the price.",
          }),
          model: MODEL,
          confidence: "low",
          flaggedForReview: true,
          flagReason: "Claim depends on an unverifiable shelf price the user reported but didn't photograph.",
          createdAt: created,
        },
      ],
    });

    await db.policySource.create({
      data: {
        caseId: caseRecord.id,
        merchant: "QuickMart Grocery",
        policyType: "price_adjustment",
        excerpt:
          "Many grocery chains honor a shelf-tag price if it's still displayed at checkout, but this couldn't be confirmed against QuickMart's specific policy, and no photo evidence of the tag was available.",
        certainty: "user_specific_assumption",
        accessedAt: created,
        createdAt: created,
      },
    });

    const communication = await db.communication.create({
      data: {
        caseId: caseRecord.id,
        direction: "outbound",
        channel: "email",
        recipientEmail: "support@quickmart.example",
        subject: "Price discrepancy — Store #4471 receipt",
        body:
          "Hello,\n\nI purchased Organic Olive Oil 1L at Store #4471, and the shelf tag showed a sale price that wasn't applied at checkout — I was charged the full $24.99 instead.\n\n" +
          "Could you look into the ~$8.00 difference and let me know if a price adjustment is possible? Receipt attached.\n\nThanks,\nAlex",
        draftedBy: "ai",
        status: "sent",
        createdAt: daysAgo(14),
        sentAt: daysAgo(14),
      },
    });

    const approval = await db.userApproval.create({
      data: {
        userId: user.id,
        caseId: caseRecord.id,
        actionType: "request_refund",
        proposedAction: JSON.stringify({
          summary: "Ask QuickMart to honor the shelf sale price and refund the difference.",
          communicationId: communication.id,
        }),
        decision: "approved",
        decidedAt: daysAgo(14),
        createdAt: daysAgo(14),
      },
    });
    await db.communication.update({ where: { id: communication.id }, data: { approvalId: approval.id } });

    await db.recoveryOutcome.create({
      data: {
        caseId: caseRecord.id,
        outcomeType: "no_recovery",
        recoveredCents: 0,
        currency: "USD",
        resolvedAt: daysAgo(10),
        notes: "QuickMart's customer service couldn't verify the promotional price without a photo of the shelf tag, and closed the case without a refund.",
        createdAt: daysAgo(10),
      },
    });

    await db.caseEvent.createMany({
      data: [
        { caseId: caseRecord.id, type: "document_added", message: "Uploaded quickmart_receipt.pdf.", createdAt: created },
        { caseId: caseRecord.id, type: "ai_analysis", message: "Redress flagged this as low-confidence — the sale price couldn't be independently verified.", createdAt: created },
        { caseId: caseRecord.id, type: "approval", message: "You approved and sent the price adjustment request to QuickMart.", createdAt: daysAgo(14) },
        { caseId: caseRecord.id, type: "status_change", message: "QuickMart declined without photo evidence of the shelf tag. Case closed.", createdAt: daysAgo(10) },
      ],
    });
  }

  log("Done.");
}
