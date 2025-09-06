"use client";

import React from "react";
import { Billing, Plan } from "@/utils/checkout";
import { useUsdToLocal } from "@/utils/currency";
import Link from "next/link";

const PRICES = {
  free: { monthly: 0, yearly: 0 },
  basic: { monthly: 4.99, yearly: 39.99 },
  pro: { monthly: 9.99, yearly: 89.99 },
} as const;

function yearlySavingsPct(monthly: number, yearly: number) {
  return Math.floor(((monthly * 12 - yearly) / (monthly * 12)) * 100);
}

const SAVE = {
  basic: yearlySavingsPct(PRICES.basic.monthly, PRICES.basic.yearly),
  pro: yearlySavingsPct(PRICES.pro.monthly, PRICES.pro.yearly),
};

export default function PricingPageContent({
  billing,
  onBillingChange,
  email,
  onEmailChange,
  onCheckout,
}: {
  billing: Billing;
  onBillingChange: (b: Billing) => void;
  email: string;
  onEmailChange: (v: string) => void;
  onCheckout: (p: Exclude<keyof typeof PRICES, 'free'> extends Plan ? Plan : Plan, b: Billing, email: string) => void;
}) {
  const { format } = useUsdToLocal();
  const emailValid = /.@.+\..+/.test((email || "").trim());

  const Card = ({ plan, highlight, description }: { plan: 'free' | 'basic' | 'pro'; highlight?: boolean; description: string }) => {
    const usd = PRICES[plan][billing as 'monthly' | 'yearly'] ?? 0;
    const { primary, anchor } = format(usd);
    const savings = plan !== 'free' && billing === 'yearly' ? SAVE[plan as 'basic' | 'pro'] : 0;
    const features = plan === 'free'
      ? ["30s preview per read", "Word highlighting"]
      : plan === 'basic'
      ? ["Natural voices", "Word highlighting", "Multiple themes"]
      : ["Everything in Basic", "Export MP3/WAV", "Embed code"];

    return (
      <div className={`card ${highlight ? 'card-popular' : ''}`}>
        <div className="mb-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold capitalize">{plan}</h3>
            {highlight && <span className="badge">Most popular</span>}
          </div>
          <p className="opacity-80 mt-1 text-sm">{description}</p>
        </div>

        <div className="space-y-2">
          <div className="text-3xl price">{primary}</div>
          {anchor && usd > 0 && <div className="text-sm opacity-70">≈ {anchor} USD</div>}
          {savings > 0 && <div className="badge-sale">Save {savings}%</div>}
          <ul className="text-sm opacity-90 mt-2 list-disc ml-5">
            {features.map((f) => (<li key={f}>{f}</li>))}
          </ul>
        </div>

        {plan !== 'free' ? (
          <div className="mt-4 space-y-2">
            <input className="btn-input" type="email" placeholder="you@example.com" value={email} onChange={(e) => onEmailChange(e.target.value)} />
            <button className="btn btn-primary w-full" disabled={!emailValid} onClick={() => emailValid && onCheckout(plan as 'basic' | 'pro', billing, email)}>Subscribe</button>
          </div>
        ) : (
          <div className="mt-4">
            <Link href="/" className="btn w-full">Get Started</Link>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="text-center">
        <h2 className="text-2xl md:text-4xl font-semibold">Plans to maximize your focus</h2>
        <p className="opacity-80 mt-2">Choose monthly or save with yearly billing.</p>
        <div className="mt-4 flex items-center justify-center gap-3">
          <div className="toggle" aria-label="Billing">
            {(["monthly", "yearly"] as Billing[]).map((b) => (
              <button key={b} aria-pressed={billing === b} className="px-3 py-2" onClick={() => onBillingChange(b)}>
                {b === "yearly" ? <>Yearly <span className="opacity-80">(save {SAVE.pro}%)</span></> : "Monthly"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card plan="free" description="Try the experience with a short preview." />
        <Card plan="basic" description="For casual listening and focus." />
        <Card plan="pro" highlight description="For creators needing exports and embeds." />
      </div>

      <div className="text-center opacity-80">Trusted by readers worldwide</div>
      <div className="logo-row">
        {Array.from({ length: 6 }).map((_, i) => (<div key={i} className="card flex items-center justify-center" style={{ height: 48 }}>Logo</div>))}
      </div>
    </div>
  );
}

