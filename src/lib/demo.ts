// The shared public demo account (see scripts/seed-demo.ts). Its credentials are
// published in the README, so it must not be deletable and its password must
// not be changeable by whoever happens to be signed in.
export const DEMO_EMAIL = "demo@redress.app";

export function isDemoEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === DEMO_EMAIL;
}
