export type HeaderEntry = { key: string; value: string };

/**
 * Baseline response headers for every route.
 *  - nosniff:           browsers must not guess a different content type (uploads are untrusted)
 *  - X-Frame-Options:   the app can't be embedded in another site: protects the approve/send
 *                       buttons from clickjacking
 *  - Referrer-Policy:   don't leak full URLs (which can contain reset/verification tokens) to other sites
 *  - Permissions-Policy: switch off browser features the app never uses
 */
export const SECURITY_HEADERS: HeaderEntry[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

/**
 * Content-Security-Policy for HTML pages.
 *
 * Deliberately partial: Next.js renders inline bootstrap scripts, and the theme script runs inline
 * before paint, so script-src needs 'unsafe-inline' unless every page is rendered with a per-request
 * nonce. With it, the policy does NOT stop an injected inline script; React's escaping is what
 * prevents that. What it does enforce: scripts, styles, fonts, images and fetches only from this
 * origin; no plugins (object-src); no <base> hijacking; forms can only post back to this origin;
 * and no framing (frame-ancestors, alongside X-Frame-Options).
 *
 * Not applied to /api/*: those return JSON, and the document download sets its own stricter
 * sandboxing policy (see app/api/documents/[documentId]/route.ts).
 */
export function contentSecurityPolicy(isDev = process.env.NODE_ENV !== "production"): string {
  return [
    "default-src 'self'",
    // 'unsafe-eval' only in development, where Next's hot reloading needs it.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
