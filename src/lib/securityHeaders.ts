export type HeaderEntry = { key: string; value: string };

/**
 * Baseline response headers for every route.
 *  - nosniff:           browsers must not guess a different content type (uploads are untrusted)
 *  - X-Frame-Options:   the app can't be embedded in another site: protects the approve/send
 *                       buttons from clickjacking
 *  - Referrer-Policy:   don't leak full URLs (which can contain reset/verification tokens) to other sites
 *  - Permissions-Policy: switch off browser features the app never uses
 * A full Content-Security-Policy is a future improvement (needs nonces for Next's inline scripts).
 */
export const SECURITY_HEADERS: HeaderEntry[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];
