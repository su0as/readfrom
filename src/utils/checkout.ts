/* Client-side checkout helpers and plan/billing types. */
"use client";

export type Plan = "basic" | "pro";
export type Billing = "monthly" | "yearly";

function env(name: string): string | undefined {
  // process.env.* is inlined by Next.js for NEXT_PUBLIC_ variables
  return (process.env as Record<string, string | undefined>)[name];
}

function byPlanBilling(plan: Plan, billing: Billing): (name: string) => string | undefined {
  const key = `${plan.toUpperCase()}_${billing.toUpperCase()}`; // e.g., BASIC_MONTHLY
  return (name: string) => env(`NEXT_PUBLIC_${name}_${key}`);
}

export function getCheckoutBaseUrl(plan: Plan, billing: Billing): string | null {
  // Tier-specific url
  const tier = byPlanBilling(plan, billing)("WHOP_CHECKOUT_URL");
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
    document.cookie = `rf_email=${encodeURIComponent(email)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  } catch {}
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
    env("NEXT_PUBLIC_WHOP_CHECKOUT_URL_PRO_YEARLY")
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

