// Billing architecture is intentionally config-driven rather than hard-coding
// a single fee model into application logic, per the product spec: the MVP
// should be able to grow into subscriptions, success fees, one-time fees, and
// promo discounts without a schema or code rewrite (see Subscription/Payment
// models in prisma/schema.prisma).

export type PlanKey = "free" | "pro_monthly";

export type BillingConfig = {
  /** Percentage of successfully recovered money charged as a success fee. Configurable, not hard-coded. */
  successFeePercent: number;
  plans: Record<PlanKey, { label: string; priceCents: number; interval: "month" | null; description: string }>;
};

export function getBillingConfig(): BillingConfig {
  const successFeePercent = Number(process.env.REDRESS_SUCCESS_FEE_PERCENT ?? "25");

  return {
    successFeePercent: Number.isFinite(successFeePercent) ? successFeePercent : 25,
    plans: {
      free: {
        label: "Free",
        priceCents: 0,
        interval: null,
        description: "Analyze unlimited documents. Pay only when Redress recovers money for you.",
      },
      pro_monthly: {
        label: "Pro",
        priceCents: 1900,
        interval: "month",
        description: "Priority analysis and follow-up automation.",
      },
    },
  };
}

export function formatSuccessFeeCopy(): string {
  const { successFeePercent } = getBillingConfig();
  return `No recovery, no success fee. If Redress helps you recover money, we charge ${successFeePercent}% of what's recovered — nothing upfront.`;
}
