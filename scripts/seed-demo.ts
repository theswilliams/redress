/**
 * Resets the shared demo account (see src/lib/demoSeed.ts) against the database in DATABASE_URL.
 *
 * Usage: npx tsx scripts/seed-demo.ts
 * Requires DATABASE_URL (and BLOB_READ_WRITE_TOKEN, so the "view document" links work when pointed
 * at the deployed app's database). The deployed app also resets it daily via app/api/cron/reset-demo.
 */

import "dotenv/config";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import ws from "ws";
import { PrismaClient } from "../src/generated/prisma/client";
import { pickDriver } from "../src/lib/dbDriver";
import { seedDemoAccount } from "../src/lib/demoSeed";
import { DEMO_EMAIL, DEMO_PASSWORD_HINT } from "../src/lib/demo";

neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}
const db = new PrismaClient({
  adapter: pickDriver(connectionString) === "neon" ? new PrismaNeon({ connectionString }) : new PrismaPg({ connectionString }),
});

seedDemoAccount(db, console.log)
  .then(() => {
    console.log(`Demo login: ${DEMO_EMAIL} / ${DEMO_PASSWORD_HINT}`);
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
