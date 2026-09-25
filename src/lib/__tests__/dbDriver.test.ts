import { describe, expect, it } from "vitest";

import { pickDriver } from "@/lib/dbDriver";

describe("pickDriver", () => {
  it.each([
    "postgresql://u:p@ep-cool-name-123456.us-east-2.aws.neon.tech/db?sslmode=require",
    "postgresql://u:p@ep-cool-name-123456-pooler.eu-central-1.aws.neon.tech/db",
    "postgres://u:p@EP-UPPER.NEON.TECH/db",
  ])("uses the Neon serverless driver for %s", (cs) => {
    expect(pickDriver(cs, undefined)).toBe("neon");
  });

  it.each([
    "postgresql://postgres:postgres@localhost:5432/redress",
    "postgresql://postgres:postgres@127.0.0.1:54329/redress_bb",
    "postgresql://u:p@db.internal.example.com:5432/app",
    "postgresql://u:p@evilneon.tech.example.com/db",
    "postgresql://u:p@notneon.tech/db",
  ])("uses the standard pg driver for %s", (cs) => {
    expect(pickDriver(cs, undefined)).toBe("pg");
  });

  it("falls back to pg for an unparseable URL, and honours an explicit override", () => {
    expect(pickDriver("not a url", undefined)).toBe("pg");
    expect(pickDriver("postgresql://u:p@localhost/db", "neon")).toBe("neon");
    expect(pickDriver("postgresql://u:p@x.neon.tech/db", "pg")).toBe("pg");
  });
});
