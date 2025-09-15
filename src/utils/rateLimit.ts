import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { NextRequest } from "next/server";

// Simple in-memory fallback (dev only)
class MemoryLimiter {
  private buckets = new Map<string, { tokens: number; resetAt: number }>();
  constructor(
    private limit: number,
    private windowMs: number,
  ) {}
  async limitId(id: string) {
    const now = Date.now();
    const slot = Math.floor(now / this.windowMs);
    const key = `${id}:${slot}`;
    const bucket = this.buckets.get(key) ?? {
      tokens: this.limit,
      resetAt: slot * this.windowMs + this.windowMs,
    };
    if (!this.buckets.has(key)) this.buckets.set(key, bucket);
    const success = bucket.tokens > 0;
    if (success) bucket.tokens -= 1;
    return {
      success,
      remaining: Math.max(0, bucket.tokens),
      reset: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }
}

let ratelimiter: Ratelimit | MemoryLimiter | null = null;

function getLimiter(limit: number, windowSec: number) {
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    return new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
    });
  }
  return new MemoryLimiter(limit, windowSec * 1000);
}

export async function limitByIP(
  req: NextRequest,
  limit = 60,
  windowSec = 3600,
) {
  if (!ratelimiter) ratelimiter = getLimiter(limit, windowSec);
  const ip =
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "anon";
  if (ratelimiter instanceof Ratelimit) {
    const { success, remaining, reset } = await ratelimiter.limit(ip);
    return { success, remaining, reset };
  }
  const res = await (ratelimiter as MemoryLimiter).limitId(ip);
  return res;
}
