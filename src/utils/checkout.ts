/* Client-side checkout helpers and plan/billing types. */
"use client";

// Legacy plan types used by existing Pricing components
export type Plan = "basic" | "pro";
export type Billing = "monthly" | "yearly";

// New subscription tiers (Weekly / Monthly / Yearly)
export type SubscriptionPlan = "weekly" | "monthly" | "yearly";

// Real Whop plan URLs (single tier — Premium, three billing frequencies)
const SUBSCRIPTION_LINKS = {
  WEEKLY: "https://whop.com/checkout/plan_Gf6WFmHaNBTuE",
  MONTHLY: "https://whop.com/checkout/plan_WUq3nLCuW4EXU",
  YEARLY: "https://whop.com/checkout/plan_NQBXU8gJkERiA",
} as const;

// Legacy fallback links — map old basic/pro to the real plans
const FALLBACK_LINKS: Record<string, string> = {
  BASIC_MONTHLY: SUBSCRIPTION_LINKS.MONTHLY,
  BASIC_YEARLY: SUBSCRIPTION_LINKS.YEARLY,
  PRO_MONTHLY: SUBSCRIPTION_LINKS.MONTHLY,
  PRO_YEARLY: SUBSCRIPTION_LINKS.YEARLY,
};

function env(name: string): string | undefined {
  const val = (process.env as Record<string, string | undefined>)[name];
  if (val) return val;
  const m = name.match(
    /^NEXT_PUBLIC_WHOP_CHECKOUT_URL_(WEEKLY|MONTHLY|YEARLY|(?:BASIC|PRO)_(?:MONTHLY|YEARLY))$/,
  );
  if (m) {
    const key = m[1] as keyof typeof FALLBACK_LINKS;
    return FALLBACK_LINKS[key];
  }
  return undefined;
}

// Legacy: plan + billing → checkout URL
function byPlanBilling(
  plan: Plan,
  billing: Billing,
): (name: string) => string | undefined {
  const key = `${plan.toUpperCase()}_${billing.toUpperCase()}`;
  return (name: string) => env(`NEXT_PUBLIC_${name}_${key}`);
}

export function getCheckoutBaseUrl(
  plan: Plan,
  billing: Billing,
): string | null {
  const tier =
    byPlanBilling(plan, billing)("WHOP_CHECKOUT_URL") ||
    env(
      `NEXT_PUBLIC_WHOP_CHECKOUT_URL_${plan.toUpperCase()}_${billing.toUpperCase()}`,
    );
  if (tier) return tier;
  const genericByBilling = env(
    `NEXT_PUBLIC_WHOP_CHECKOUT_URL_${billing.toUpperCase()}`,
  );
  if (genericByBilling) return genericByBilling;
  const any = env("NEXT_PUBLIC_WHOP_CHECKOUT_URL");
  return any || null;
}

// New: subscription plan → checkout URL
export function getSubscriptionCheckoutUrl(
  plan: SubscriptionPlan,
): string | null {
  const key = plan.toUpperCase() as "WEEKLY" | "MONTHLY" | "YEARLY";
  return (
    env(`NEXT_PUBLIC_WHOP_CHECKOUT_URL_${key}`) ||
    SUBSCRIPTION_LINKS[key] ||
    null
  );
}

export function setEmailCookie(email: string) {
  if (typeof document === "undefined") return;
  try {
    fetch("/api/cookies/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
  } catch {}
  try {
    localStorage.setItem("rf_email_last", email);
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

export function buildCheckoutUrl(
  plan: Plan,
  billing: Billing,
  opts?: { email?: string; origin?: string; extra?: Record<string, string> },
): string | null {
  const base = getCheckoutBaseUrl(plan, billing);
  if (!base) return null;
  const origin =
    opts?.origin ||
    (typeof window !== "undefined" ? window.location.origin : "");
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
  return true; // SUBSCRIPTION_LINKS are always set
}

// Legacy checkout (plan + billing)
export function startCheckout(plan: Plan, billing: Billing, email?: string) {
  if (email && email.includes("@")) setEmailCookie(email);
  const url = buildCheckoutUrl(plan, billing, { email });
  if (!url) {
    if (typeof window !== "undefined") alert("Checkout not configured");
    return;
  }
  if (typeof window !== "undefined") window.location.href = url;
}

// New checkout (weekly / monthly / yearly)
export function startSubscriptionCheckout(
  plan: SubscriptionPlan,
  email?: string,
) {
  if (email && email.includes("@")) setEmailCookie(email);
  const base = SUBSCRIPTION_LINKS[plan.toUpperCase() as "WEEKLY" | "MONTHLY" | "YEARLY"];
  if (!base) {
    if (typeof window !== "undefined") alert("Checkout not configured");
    return;
  }
  const url = new URL(base);
  const e = (email || getEmailCookie() || "").trim();
  if (e) url.searchParams.set("email", e);
  if (typeof window !== "undefined") {
    url.searchParams.set(
      "redirect",
      `${window.location.origin}/checkout/return`,
    );
    window.location.href = url.toString();
  }
}

function planIdFromUrl(u?: string): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    const m = url.pathname.match(/\/plan_[A-Za-z0-9]+/);
    return m ? m[0].slice(1) : null;
  } catch {
    const m = u.match(/\/plan_[A-Za-z0-9]+/);
    return m ? m[0].slice(1) : null;
  }
}

export function planLabelFromId(id?: string | null): string | null {
  if (!id) return null;
  const labels: Record<string, string> = {
    "plan_Gf6WFmHaNBTuE": "Premium Weekly",
    "plan_WUq3nLCuW4EXU": "Premium Monthly",
    "plan_NQBXU8gJkERiA": "Premium Yearly",
  };
  if (labels[id]) return labels[id];
  // Fallback: derive from URL map for any env-configured plans
  const map = new Map<string, string>();
  const entries: Array<[string | undefined, string]> = [
    [env("NEXT_PUBLIC_WHOP_CHECKOUT_URL_WEEKLY"), "Weekly"],
    [env("NEXT_PUBLIC_WHOP_CHECKOUT_URL_MONTHLY"), "Monthly"],
    [env("NEXT_PUBLIC_WHOP_CHECKOUT_URL_YEARLY"), "Yearly"],
  ];
  for (const [u, label] of entries) {
    const pid = planIdFromUrl(u);
    if (pid) map.set(pid, label);
  }
  return map.get(id) || null;
}

export function planTierFromId(id?: string | null): "basic" | "pro" | null {
  if (!id) return null;
  // All new plans grant full ("pro") access
  const proPlanIds = new Set([
    "plan_Gf6WFmHaNBTuE", // weekly
    "plan_WUq3nLCuW4EXU", // monthly
    "plan_NQBXU8gJkERiA", // yearly
  ]);
  if (proPlanIds.has(id)) return "pro";
  // Fallback: check env-configured URLs
  const pairs: Array<[string | undefined, "basic" | "pro"]> = [
    [env("NEXT_PUBLIC_WHOP_CHECKOUT_URL_MONTHLY"), "pro"],
    [env("NEXT_PUBLIC_WHOP_CHECKOUT_URL_YEARLY"), "pro"],
  ];
  for (const [u, tier] of pairs) {
    const pid = planIdFromUrl(u);
    if (pid && pid === id) return tier;
  }
  return null;
}
