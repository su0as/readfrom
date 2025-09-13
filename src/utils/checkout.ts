/* Client-side checkout helpers and plan/billing types. */
"use client";

export type Plan = "basic" | "pro";
export type Billing = "monthly" | "yearly";

// Optional hardcoded fallbacks (used if env vars are missing)
// These can be overwritten by setting NEXT_PUBLIC_WHOP_CHECKOUT_URL_* env vars.
const FALLBACK_LINKS: Partial<Record<"BASIC_MONTHLY" | "BASIC_YEARLY" | "PRO_MONTHLY" | "PRO_YEARLY", string>> = {
  BASIC_MONTHLY: "https://whop.com/checkout/plan_WuQ9oNNUPtoqW?d2c=true",
  BASIC_YEARLY: "https://whop.com/checkout/plan_UREUrsMIXAO1N?d2c=true",
  PRO_MONTHLY: "https://whop.com/checkout/plan_o9jbTY2jmGRo8?d2c=true",
  PRO_YEARLY: "https://whop.com/checkout/plan_DWncFUzXGw4Cc?d2c=true",
};

function env(name: string): string | undefined {
  // process.env.* is inlined by Next.js for NEXT_PUBLIC_ variables
  const val = (process.env as Record<string, string | undefined>)[name];
  if (val) return val;
  // If a direct env is missing, return a fallback when the name matches our pattern
  const m = name.match(/^NEXT_PUBLIC_WHOP_CHECKOUT_URL_(BASIC|PRO)_(MONTHLY|YEARLY)$/);
  if (m) {
    const key = `${m[1]}_${m[2]}` as keyof typeof FALLBACK_LINKS;
    return FALLBACK_LINKS[key];
  }
  return undefined;
}

function byPlanBilling(plan: Plan, billing: Billing): (name: string) => string | undefined {
  const key = `${plan.toUpperCase()}_${billing.toUpperCase()}`; // e.g., BASIC_MONTHLY
  return (name: string) => env(`NEXT_PUBLIC_${name}_${key}`);
}

export function getCheckoutBaseUrl(plan: Plan, billing: Billing): string | null {
  // Tier-specific url
  const tier = byPlanBilling(plan, billing)("WHOP_CHECKOUT_URL") || env(`NEXT_PUBLIC_WHOP_CHECKOUT_URL_${plan.toUpperCase()}_${billing.toUpperCase()}`);
  if (tier) return tier;
  // Generic monthly/yearly fallbacks
  const genericByBilling = env(`NEXT_PUBLIC_WHOP_CHECKOUT_URL_${billing.toUpperCase()}`);
  if (genericByBilling) return genericByBilling;
  // Single generic fallback
  const any = env("NEXT_PUBLIC_WHOP_CHECKOUT_URL");
  return any || null;
}

export function setEmailCookie(email: string) {
  if (typeof document === "undefined") return;
  try {
    // Set HttpOnly cookie via server (cannot be read by JS) and store a non-sensitive hint locally
    fetch('/api/cookies/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }).catch(() => {});
  } catch {}
  try { localStorage.setItem('rf_email_last', email); } catch {}
}

function getEmailCookie(): string | null {
  if (typeof document === "undefined") return null;
  try {
    const m = document.cookie.match(/(?:^|; )rf_email=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

export function buildCheckoutUrl(plan: Plan, billing: Billing, opts?: { email?: string; origin?: string; extra?: Record<string, string> }): string | null {
  const base = getCheckoutBaseUrl(plan, billing);
  if (!base) return null;
  const origin = opts?.origin || (typeof window !== "undefined" ? window.location.origin : "");
  const url = new URL(base);
  const email = (opts?.email || getEmailCookie() || "").trim();
  if (email) url.searchParams.set("email", email);
  if (origin) url.searchParams.set("redirect", `${origin}/checkout/return`);
  url.searchParams.set("plan", plan);
  url.searchParams.set("billing", billing);
  if (opts?.extra) {
    for (const [k, v] of Object.entries(opts.extra)) url.searchParams.set(k, v);
  }
  return url.toString();
}

export function isCheckoutConfigured(): boolean {
  return !!(
    env("NEXT_PUBLIC_WHOP_CHECKOUT_URL") ||
    env("NEXT_PUBLIC_WHOP_CHECKOUT_URL_MONTHLY") ||
    env("NEXT_PUBLIC_WHOP_CHECKOUT_URL_YEARLY") ||
    env("NEXT_PUBLIC_WHOP_CHECKOUT_URL_BASIC_MONTHLY") ||
    env("NEXT_PUBLIC_WHOP_CHECKOUT_URL_BASIC_YEARLY") ||
    env("NEXT_PUBLIC_WHOP_CHECKOUT_URL_PRO_MONTHLY") ||
    env("NEXT_PUBLIC_WHOP_CHECKOUT_URL_PRO_YEARLY") ||
    FALLBACK_LINKS.BASIC_MONTHLY || FALLBACK_LINKS.BASIC_YEARLY || FALLBACK_LINKS.PRO_MONTHLY || FALLBACK_LINKS.PRO_YEARLY
  );
}

export function startCheckout(plan: Plan, billing: Billing, email?: string) {
  if (email && email.includes("@")) setEmailCookie(email);
  const url = buildCheckoutUrl(plan, billing, { email });
  if (!url) {
    if (typeof window !== "undefined") alert("Checkout not configured");
    return;
  }
  if (typeof window !== "undefined") window.location.href = url;
}

// Extract plan id from a Whop checkout URL like .../plan_XXXX?...  -> returns plan_XXXX
function planIdFromUrl(u?: string): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    const m = url.pathname.match(/\/plan_[A-Za-z0-9]+/);
    return m ? m[0].slice(1) : null;
  } catch {
    // raw string fallback
    const m = u.match(/\/plan_[A-Za-z0-9]+/);
    return m ? m[0].slice(1) : null;
  }
}

export function planLabelFromId(id?: string | null): string | null {
  if (!id) return null;
  const map = new Map<string, string>();
  const entries: Array<[string | undefined, string]> = [
    [env("NEXT_PUBLIC_WHOP_CHECKOUT_URL_BASIC_MONTHLY"), "Basic Monthly"],
    [env("NEXT_PUBLIC_WHOP_CHECKOUT_URL_BASIC_YEARLY"), "Basic Yearly"],
    [env("NEXT_PUBLIC_WHOP_CHECKOUT_URL_PRO_MONTHLY"), "Pro Monthly"],
    [env("NEXT_PUBLIC_WHOP_CHECKOUT_URL_PRO_YEARLY"), "Pro Yearly"],
  ];
  for (const [u, label] of entries) {
    const pid = planIdFromUrl(u);
    if (pid) map.set(pid, label);
  }
  return map.get(id) || null;
}

export function planTierFromId(id?: string | null): 'basic' | 'pro' | null {
  if (!id) return null;
  const pairs: Array<[string | undefined, 'basic' | 'pro']> = [
    [env("NEXT_PUBLIC_WHOP_CHECKOUT_URL_BASIC_MONTHLY"), 'basic'],
    [env("NEXT_PUBLIC_WHOP_CHECKOUT_URL_BASIC_YEARLY"), 'basic'],
    [env("NEXT_PUBLIC_WHOP_CHECKOUT_URL_PRO_MONTHLY"), 'pro'],
    [env("NEXT_PUBLIC_WHOP_CHECKOUT_URL_PRO_YEARLY"), 'pro'],
  ];
  for (const [u, tier] of pairs) {
    const pid = planIdFromUrl(u);
    if (pid && pid === id) return tier;
  }
  return null;
}

