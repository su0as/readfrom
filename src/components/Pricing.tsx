"use client";

import React, { useEffect, useMemo } from "react";
import { Billing, Plan, isCheckoutConfigured } from "@/utils/checkout";
import { useUsdToLocal } from "@/utils/currency";
type Props = {
  variant?: "full" | "compact";
  selectedPlan: Plan;
  billing: Billing;
  onPlanChange: (p: Plan) => void;
  onBillingChange: (b: Billing) => void;
  onCheckout: (plan: Plan, billing: Billing, email?: string) => void;
  showSocialProof?: boolean;
  showFAQ?: boolean;
  showComparison?: boolean;
  email?: string;
  onEmailChange?: (email: string) => void;
  analytics?: {
    onOpen?: (meta?: Record<string, unknown>) => void;
    onPlanSelect?: (plan: Plan) => void;
    onBillingSelect?: (billing: Billing) => void;
    onCheckoutClick?: (meta: { plan: Plan; billing: Billing }) => void;
  };
};

// Base USD prices
const PRICES = {
  basic: { monthly: 4.99, yearly: 39.99 },
  pro: { monthly: 9.99, yearly: 89.99 },
} as const satisfies Record<Plan, Record<Billing, number>>;

function yearlySavingsPct(monthlyUsd: number, yearlyUsd: number) {
  const fullYear = monthlyUsd * 12;
  const save = Math.max(0, fullYear - yearlyUsd);
  return Math.floor((save / fullYear) * 100);
}

const SAVINGS = {
  basic: yearlySavingsPct(PRICES.basic.monthly, PRICES.basic.yearly), // ~33
  pro: yearlySavingsPct(PRICES.pro.monthly, PRICES.pro.yearly), // ~25
} as const;

function OldPrice({ plan }: { plan: Plan }) {
  // "Fake" crossed-out monthly anchor
  const old = plan === "basic" ? 6.99 : 12.99;
  return <span className="strike mr-1">${old.toFixed(2)}</span>;
}

function PlanCard({
  plan,
  billing,
  highlight,
  email = "",
  onEmailChange,
  onCheckout,
  requireEmail = true,
}: {
  plan: Plan;
  billing: Billing;
  highlight?: boolean;
  email?: string;
  onEmailChange?: (v: string) => void;
  onCheckout: (plan: Plan, billing: Billing, email?: string) => void;
  requireEmail?: boolean;
}) {
  const { format } = useUsdToLocal();
  const usd = PRICES[plan][billing];
  const { primary, anchor } = format(usd);
  const savings = billing === "yearly" ? SAVINGS[plan] : 0;

  const features: string[] = useMemo(() => {
    const base = [
      "Natural voices (US/UK)",
      "Word-level highlighting",
      "Adjust speed",
      "Themes (white/dark/beige)",
      "Import TXT/PDF",
      "Unlimited reading",
    ];
    const proExtra = [
      "Export audio (MP3/WAV)",
      "Speed & pitch presets",
      "Preview snippet before full",
      "Download outputs",
      "Embed code for websites (HTML/iframe)",
    ];
    return plan === "pro" ? [...base, ...proExtra] : base;
  }, [plan]);

  const configured = isCheckoutConfigured();
  const emailValid = !requireEmail || /.+@.+\..+/.test((email || "").trim());

  return (
    <div className={`card ${highlight ? "card-popular" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-lg capitalize">{plan} {billing === "yearly" && <span className="ml-2 badge">Yearly</span>}</h3>
        {highlight && <span className="badge">Most popular</span>}
      </div>
      <div className="mb-1 text-3xl price">
        {billing === "monthly" && <OldPrice plan={plan} />} {primary}
      </div>
      {anchor && <div className="text-sm opacity-70">≈ {anchor} USD</div>}
      {savings > 0 && (
        <div className="mt-2 inline-flex items-center gap-2 badge-sale" aria-label={`Save ${savings}%`}>Save {savings}%</div>
      )}

      <ul className="mt-4 space-y-2">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2">
            <span aria-hidden>✔️</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-col gap-2">
        {onEmailChange && (
          <input
            className="btn"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            aria-label="Your email"
            required={requireEmail}
          />
        )}
        {!emailValid && requireEmail && (
          <div className="text-sm opacity-80" role="alert">Enter a valid email to continue</div>
        )}
        <button
          className="btn"
          disabled={!configured || !emailValid}
          title={configured ? (emailValid ? "Subscribe" : "Enter a valid email") : "Checkout not configured"}
          onClick={() => { if (emailValid) onCheckout(plan, billing, email); }}
          aria-label={`Subscribe to ${plan} ${billing}`}
        >
          Subscribe
        </button>
      </div>
    </div>
  );
}

export default function Pricing({
  variant = "full",
  selectedPlan,
  billing,
  onPlanChange,
  onBillingChange,
  onCheckout,
  showSocialProof = true,
  showFAQ = true,
  showComparison = true,
  email,
  onEmailChange,
  analytics,
}: Props) {
  useEffect(() => { analytics?.onOpen?.(); }, [analytics]);
  const savingsBasic = SAVINGS.basic;
  const savingsPro = SAVINGS.pro;

  const Toggle = (
    <div className="toggle" aria-label="Billing toggle">
      {(["monthly", "yearly"] as Billing[]).map((b) => (
        <button
          key={b}
          aria-pressed={billing === b}
          className="px-3 py-2"
          onClick={() => { onBillingChange(b); analytics?.onBillingSelect?.(b); }}
        >
          {b === "yearly" ? (
            <span>Yearly <span className="opacity-80">(save {selectedPlan === "pro" ? savingsPro : savingsBasic}%)</span></span>
          ) : (
            <span>Monthly</span>
          )}
        </button>
      ))}
    </div>
  );

  const PlanSwitch = (
    <div className="toggle" aria-label="Plan toggle">
      {(["basic", "pro"] as Plan[]).map((p) => (
        <button
          key={p}
          role="tab"
          aria-pressed={selectedPlan === p}
          className="px-3 py-2 capitalize"
          onClick={() => { onPlanChange(p); analytics?.onPlanSelect?.(p); }}
        >
          {p}
        </button>
      ))}
    </div>
  );

  if (variant === "compact") {
    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-base font-semibold">Unlock full narration</h3>
        {PlanSwitch}
        {Toggle}
        <PlanCard plan={selectedPlan} billing={billing} email={email} onEmailChange={onEmailChange} onCheckout={onCheckout} requireEmail />
        <ul className="text-sm opacity-80 list-disc ml-5">
          <li>Unlimited listening</li>
          <li>Higher-quality voices</li>
          <li>Cancel anytime</li>
        </ul>
        <a className="text-sm underline opacity-80" href="/pricing">See all features</a>
      </div>
    );
  }

  // full variant
  return (
    <div className="flex flex-col gap-8">
      <div className="text-center">
        <h2 className="text-2xl md:text-4xl font-semibold">Plans to maximize your focus</h2>
        <p className="opacity-80 mt-2">Choose monthly or save with yearly billing.</p>
        <div className="mt-4 flex items-center justify-center gap-3">{PlanSwitch}{Toggle}</div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <PlanCard plan="basic" billing={billing} email={email} onEmailChange={onEmailChange} onCheckout={onCheckout} requireEmail />
        <PlanCard plan="pro" billing={billing} email={email} onEmailChange={onEmailChange} onCheckout={onCheckout} requireEmail />
      </div>

      {showComparison && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="card">
            <h3 className="font-semibold mb-2">Basic is great for</h3>
            <ul className="list-disc ml-5 opacity-90">
              <li>Reading articles and PDFs with highlighting</li>
              <li>Previewing voices and speeds</li>
              <li>Casual listening</li>
            </ul>
          </div>
          <div className="card card-popular">
            <h3 className="font-semibold mb-2">Pro is built for</h3>
            <ul className="list-disc ml-5 opacity-90">
              <li>Exporting narrations for sharing and embedding</li>
              <li>More control (pitch presets) and faster workflow</li>
              <li>Creators and power users</li>
            </ul>
          </div>
        </div>
      )}

      {showSocialProof && (
        <div>
          <div className="opacity-80 mb-2 text-center">Trusted by readers worldwide</div>
          <div className="logo-row">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card flex items-center justify-center" style={{ height: 48 }}>Logo</div>
            ))}
          </div>
        </div>
      )}

      {showFAQ && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card">
            <h4 className="font-semibold mb-2">Can I cancel anytime?</h4>
            <p className="opacity-80">Yes. Subscriptions can be canceled any time; access continues until the end of the paid period.</p>
          </div>
          <div className="card">
            <h4 className="font-semibold mb-2">What’s included in the preview?</h4>
            <p className="opacity-80">Non‑entitled users can listen to a short preview to try the voice and pacing.</p>
          </div>
          <div className="card">
            <h4 className="font-semibold mb-2">Do you support exports?</h4>
            <p className="opacity-80">Yes — Pro includes MP3/WAV exports and an embeddable player code.</p>
          </div>
          <div className="card">
            <h4 className="font-semibold mb-2">Is there a refund policy?</h4>
            <p className="opacity-80">We keep it simple: if something goes wrong, reach out and we’ll make it right.</p>
          </div>
        </div>
      )}
    </div>
  );
}

