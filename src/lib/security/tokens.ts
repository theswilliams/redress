import { createHash, randomBytes } from "node:crypto";

/**
 * One-time tokens for emailed links (password reset, email verification).
 *
 * The raw token only ever exists in the emailed link; the database stores its SHA-256 hash (in the
 * `token` column). Someone who can read the database therefore can't use a stored row to reset a
 * password. The tokens are 256 random bits, so a plain unsalted hash is enough: there's nothing to
 * brute-force.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashToken(token) };
}
