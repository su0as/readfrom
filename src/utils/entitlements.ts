/* Minimal entitlement store with Redis (Upstash) fallback to in-memory.
   Entitlements are keyed by email for now; later we can migrate to user IDs.
*/
import { Redis } from "@upstash/redis";

export type EntitlementStatus = "active" | "canceled" | "past_due" | "inactive";
export interface EntitlementRecord {
  email: string;
  status: EntitlementStatus;
  productId?: string;
  planId?: string;
  periodEnd?: number; // epoch ms if subscription
  source?: "whop" | "dev";
  updatedAt: number; // epoch ms
}

const MEM = new Map<string, EntitlementRecord>();

function getRedis(): Redis | null {
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return null;
}

function key(email: string) {
  return `rf:entl:${email.toLowerCase()}`;
}

export async function setEntitlement(rec: EntitlementRecord) {
  const r = getRedis();
  if (r) {
    await r.set(key(rec.email), rec);
  } else {
    MEM.set(key(rec.email), rec);
  }
}

export async function getEntitlement(
  email: string,
): Promise<EntitlementRecord | null> {
  const r = getRedis();
  if (r) {
    const val = await r.get<EntitlementRecord | null>(key(email));
    return val ?? null;
  }
  return MEM.get(key(email)) ?? null;
}

export async function isEntitled(email?: string | null): Promise<boolean> {
  if (!email) return false;
  const rec = await getEntitlement(email);
  if (!rec) return false;
  if (rec.status !== "active") return false;
  // periodEnd may be seconds or ms depending on source; normalize to ms for comparison
  const pe =
    typeof rec.periodEnd === "number"
      ? rec.periodEnd < 1e12
        ? rec.periodEnd * 1000
        : rec.periodEnd
      : undefined;
  if (pe && Date.now() > pe) return false;
  return true;
}

// Convenience for dev: load comma-separated emails from DEV_ENTITLED_EMAILS
(function preloadDevEntitlements() {
  if (!process.env.DEV_ENTITLED_EMAILS) return;
  const list = process.env.DEV_ENTITLED_EMAILS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const email of list) {
    MEM.set(key(email), {
      email,
      status: "active",
      source: "dev",
      updatedAt: Date.now(),
    });
  }
})();
