import { describe, it, expect, afterEach } from "vitest";
import { getBillingConfig, formatSuccessFeeCopy } from "@/lib/billing/config";

describe("billing config", () => {
  const original = process.env.REDRESS_SUCCESS_FEE_PERCENT;

  afterEach(() => {
    process.env.REDRESS_SUCCESS_FEE_PERCENT = original;
  });

  it("reads the success fee percent from the environment", () => {
    process.env.REDRESS_SUCCESS_FEE_PERCENT = "30";
    expect(getBillingConfig().successFeePercent).toBe(30);
    expect(formatSuccessFeeCopy()).toContain("30%");
  });

  it("falls back to a default when unset or invalid", () => {
    process.env.REDRESS_SUCCESS_FEE_PERCENT = "not-a-number";
    expect(getBillingConfig().successFeePercent).toBe(25);
  });

  it("exposes at least a free plan", () => {
    const config = getBillingConfig();
    expect(config.plans.free.priceCents).toBe(0);
  });
});
