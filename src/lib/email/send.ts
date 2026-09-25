import { getEmailClient, isEmailConfigured, EMAIL_FROM } from "@/lib/email/client";

export type SendEmailResult = { ok: true; providerMessageId: string } | { ok: false; error: string };

/**
 * Generic transactional send. Returns a typed result instead of throwing so
 * callers can decide how to handle failure (e.g. the claim-approval flow
 * surfaces it to the user and lets them retry; account emails like password
 * resets log it and respond identically either way, so as not to leak
 * account existence).
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
}): Promise<SendEmailResult> {
  if (!isEmailConfigured()) {
    return { ok: false, error: "EMAIL_NOT_CONFIGURED" };
  }

  const client = getEmailClient();
  if (!client) {
    return { ok: false, error: "EMAIL_NOT_CONFIGURED" };
  }

  try {
    const result = await client.emails.send({
      from: EMAIL_FROM,
      to: params.to,
      replyTo: params.replyTo,
      // Single line only: strip CR/LF so a subject can never smuggle extra headers.
      subject: params.subject.replace(/[\r\n]+/g, " ").slice(0, 200),
      text: params.body,
    });

    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    if (!result.data) {
      return { ok: false, error: "No response data from email provider." };
    }

    return { ok: true, providerMessageId: result.data.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Sends the approved claim message to the merchant. This is only ever called
 * after a user has explicitly approved a case (see
 * app/api/cases/[caseId]/approve/route.ts) — never automatically.
 *
 * replyTo is set to the user's own email so any merchant response goes
 * straight to them, not to Redress.
 */
export function sendClaimEmail(params: { to: string; subject: string; body: string; replyTo: string }) {
  return sendEmail(params);
}

export function sendPasswordResetEmail(params: { to: string; resetUrl: string }) {
  return sendEmail({
    to: params.to,
    subject: "Reset your Redress password",
    body: [
      "We received a request to reset your Redress password.",
      "",
      `Reset it here: ${params.resetUrl}`,
      "",
      "This link expires in 30 minutes. If you didn't request this, you can safely ignore this email.",
    ].join("\n"),
  });
}

export function sendVerificationEmail(params: { to: string; verifyUrl: string }) {
  return sendEmail({
    to: params.to,
    subject: "Verify your Redress email address",
    body: [
      "Welcome to Redress! Please verify your email address to finish setting up your account.",
      "",
      `Verify it here: ${params.verifyUrl}`,
      "",
      "This link expires in 24 hours. If you didn't create a Redress account, you can safely ignore this email.",
    ].join("\n"),
  });
}
