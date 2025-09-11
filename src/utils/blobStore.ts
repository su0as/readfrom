/* Simple blob/spec store using Upstash Redis if configured; otherwise in-memory (dev only).
   Keys are stored with TTL in seconds. */
import { Redis } from '@upstash/redis';

let MEM = new Map<string, { v: string; exp: number }>();

function getRedis(): Redis | null {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
  }
  return null;
}

export async function storeSet(key: string, val: string, ttlSec: number) {
  const r = getRedis();
  if (r) {
    await r.set(key, val, { ex: ttlSec });
  } else {
    MEM.set(key, { v: val, exp: Date.now() + ttlSec * 1000 });
  }
}

export async function storeGet(key: string): Promise<string | null> {
  const r = getRedis();
  if (r) {
    const v = await r.get<string | null>(key);
    return v ?? null;
  }
  const it = MEM.get(key);
  if (!it) return null;
  if (Date.now() > it.exp) { MEM.delete(key); return null; }
  return it.v;
}

