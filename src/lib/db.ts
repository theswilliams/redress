import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import ws from "ws";
import { PrismaClient } from "@/generated/prisma/client";
import { pickDriver } from "@/lib/dbDriver";

// Required for the Neon serverless driver to work over a plain Node.js
// runtime (Vercel functions, `next dev`, `next start`) rather than the
// browser/edge fetch-based transport it uses by default.
neonConfig.webSocketConstructor = ws;

declare global {
  var __prisma: PrismaClient | undefined;
}

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — see .env.example for a Postgres connection string.");
  }
  const adapter =
    pickDriver(connectionString) === "neon" ? new PrismaNeon({ connectionString }) : new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const db = globalThis.__prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = db;
}
