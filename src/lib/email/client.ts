import { Resend } from "resend";

let client: Resend | null | undefined;

/** Returns null when no API key is configured, so callers can fall back to a clearly-labeled simulated send. */
export function getEmailClient(): Resend | null {
  if (client !== undefined) return client;

  const apiKey = process.env.RESEND_API_KEY;
  client = apiKey ? new Resend(apiKey) : null;
  return client;
}

export function isEmailConfigured(): boolean {
  return getEmailClient() !== null;
}

/**
 * Sender address for outgoing claim emails. Defaults to Resend's shared
 * sandbox sender, which only delivers to the email address of the Resend
 * account owner until a custom domain is verified — see
 * https://resend.com/docs/dashboard/domains/introduction. Set EMAIL_FROM to a
 * verified address once a domain is set up to send to arbitrary merchants.
 */
export const EMAIL_FROM = process.env.EMAIL_FROM ?? "Redress <onboarding@resend.dev>";
