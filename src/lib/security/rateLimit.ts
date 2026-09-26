// Rate limiting. Uses Upstash Redis (REST-based, so it works from serverless
// functions) when configured — required in production, since Vercel
// serverless functions are stateless per-invocation and don't share memory
// across requests, unlike a long-running Node process. Falls back to a local
// in-memory limiter when Upstash isn't configured, which is fine for local
// dev but does NOT meaningfully rate-limit anything once deployed.

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let redis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

let warnedNoRedis = false;
function warnIfProductionWithoutRedis() {
  if (warnedNoRedis || process.env.NODE_ENV !== "production") return;
  warnedNoRedis = true;
  console.warn(
    "[redress] UPSTASH_REDIS_REST_URL/TOKEN are not set: rate limits are per-instance memory only and do not hold on serverless hosting.",
  );
}

type Bucket = { count: number; resetAt: number };
const memoryBuckets = new Map<string, Bucket>();

function memoryRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const existing = memoryBuckets.get(key);

  if (!existing || existing.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count };
}

export async function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): Promise<{ allowed: boolean; remaining: number }> {
  const client = getRedis();
  if (!client) {
    warnIfProductionWithoutRedis();
    return memoryRateLimit(key, limit, windowMs);
  }

  const ratelimit = new Ratelimit({
    redis: client,
    limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
    prefix: "redress",
  });

  const result = await ratelimit.limit(key);
  return { allowed: result.success, remaining: result.remaining };
}

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "unknown";
}
