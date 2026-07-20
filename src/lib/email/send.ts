import { getEmailClient, isEmailConfigured, EMAIL_FROM } from "@/lib/email/client";

export type SendEmailResult = { ok: true; providerMessageId: string } | { ok: false; error: string };

/**
 * Sends the approved claim message to the merchant. This is only ever called
 * after a user has explicitly approved a case (see
 * app/api/cases/[caseId]/approve/route.ts) — never automatically.
 *
 * replyTo is set to the user's own email so any merchant response goes
 * straight to them, not to Redress.
 */
export async function sendClaimEmail(params: {
  to: string;
  subject: string;
  body: string;
  replyTo: string;
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
      subject: params.subject,
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
