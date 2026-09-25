/**
 * Base URL used in links we email out (password reset, email verification).
 *
 * Never derive it from the incoming request's Host header alone: an attacker who can control the
 * Host header when requesting a reset for someone else's address could get a reset link pointing at
 * their own domain ("password reset poisoning"). Prefer configuration:
 *   1. APP_URL (explicit)
 *   2. AUTH_URL / NEXTAUTH_URL (Auth.js)
 *   3. VERCEL_PROJECT_PRODUCTION_URL (set automatically on Vercel)
 * and only fall back to the request's own origin when nothing is configured (local development).
 */
export function appOrigin(requestUrl: string): string {
  const configured = process.env.APP_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // fall through to the next source
    }
  }
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) {
    try {
      return new URL(vercel.startsWith("http") ? vercel : `https://${vercel}`).origin;
    } catch {
      // fall through
    }
  }
  return new URL(requestUrl).origin;
}

export function appUrl(pathAndQuery: string, requestUrl: string): string {
  return new URL(pathAndQuery, appOrigin(requestUrl)).toString();
}
