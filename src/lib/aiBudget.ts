import { db } from "@/lib/db";

/**
 * Rolling 24-hour cap on AI analyses per user.
 *
 * Each analysis makes several paid model calls, registration is free, and the per-minute rate limits
 * alone still allow thousands of calls a day from one account. This bounds the worst case per account
 * (it does not stop someone registering many accounts: that needs CAPTCHA/verification and a global
 * spend cap at the AI provider).
 */
export const DEFAULT_MAX_ANALYSES_PER_DAY = 20;

export function maxAnalysesPerDay(): number {
  const configured = Number(process.env.AI_MAX_ANALYSES_PER_DAY);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_ANALYSES_PER_DAY;
}

export async function analysisBudgetExceeded(userId: string, now = Date.now()): Promise<boolean> {
  const since = new Date(now - 24 * 60 * 60 * 1000);
  const used = await db.job.count({
    where: { type: "analyze_document", createdAt: { gte: since }, case: { userId } },
  });
  return used >= maxAnalysesPerDay();
}

export const BUDGET_EXCEEDED_MESSAGE =
  "You've reached today's analysis limit. Please try again tomorrow.";
