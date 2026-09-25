/**
 * Which Postgres driver to use for a connection string.
 *
 * Neon / Vercel Postgres hosts (`*.neon.tech`) use the Neon serverless driver (WebSocket transport,
 * designed for serverless functions). Any other host (a local Postgres, Docker, CI) uses the standard
 * `pg` driver: the Neon driver speaks to a Neon proxy and cannot connect to a plain Postgres server.
 * `DATABASE_DRIVER=neon|pg` overrides the automatic choice.
 */
export function pickDriver(connectionString: string, override = process.env.DATABASE_DRIVER): "neon" | "pg" {
  if (override === "neon" || override === "pg") return override;
  try {
    return /(^|\.)neon\.tech$/i.test(new URL(connectionString).hostname) ? "neon" : "pg";
  } catch {
    return "pg";
  }
}
