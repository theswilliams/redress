// The shared public demo account (see scripts/seed-demo.ts). Its credentials are published in the
// README and on the landing page, so it must not be deletable, its password must not be changeable,
// and it must never send a real email (enforced in the approval route).
export const DEMO_EMAIL = "demo@redress.app";

// Public on purpose: this is the published demo password, not a secret. It is shown to visitors so
// they can try the app, and the account can't do anything harmful (see above).
export const DEMO_PASSWORD_HINT = "RedressDemo2026!";

export function isDemoEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === DEMO_EMAIL;
}
