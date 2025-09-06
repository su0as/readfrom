"use client";

import React from "react";
import { Billing, Plan } from "@/utils/checkout";
import { useUsdToLocal } from "@/utils/currency";
import Link from "next/link";

const PRICES = {
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

export default function PricingSidebar({
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
  onCheckout: (p: Plan, b: Billing, email: string) => void;
}) {
  const { format } = useUsdToLocal();
  const emailValid = /.+@.+\..+/.test((email || "").trim());

  const Card = ({ plan, highlight }: { plan: Plan; highlight?: boolean }) => {
    const usd = PRICES[plan][billing];
    const { primary, anchor } = format(usd);
    const savings = billing === "yearly" ? SAVE[plan] : 0;
    const features = plan === "basic"
      ? ["Word highlighting", "Multiple voices"]
      : ["Everything in Basic", "Export MP3/WAV"];

    return (
      <div className={`card ${highlight ? "card-popular" : ""}`}>
        <div className="flex items-center justify-between mb-1">
          <h4 className="font-semibold capitalize">{plan}</h4>
          {highlight && <span className="badge">Recommended</span>}
        </div>
        <div className="mb-1 text-2xl price">{primary}</div>
        {anchor && <div className="text-sm opacity-70">≈ {anchor} USD</div>}
        {savings > 0 && <div className="badge-sale mt-2">Save {savings}%</div>}

        <div className="mt-3 flex gap-2">
          <input className="btn" type="email" placeholder="you@example.com" value={email} onChange={(e) => onEmailChange(e.target.value)} />
          <button className="btn btn-primary" disabled={!emailValid} onClick={() => emailValid && onCheckout(plan, billing, email)}>Subscribe</button>
        </div>

        <ul className="text-sm opacity-90 mt-3 list-disc ml-5">
          {features.map((f) => (<li key={f}>{f}</li>))}
        </ul>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-base font-semibold">Unlock full narration</h3>
      <div className="toggle" aria-label="Billing">
        {(["monthly", "yearly"] as Billing[]).map((b) => (
          <button key={b} aria-pressed={billing === b} className="px-3 py-2" onClick={() => onBillingChange(b)}>
            {b === "yearly" ? <>Yearly <span className="opacity-80">(save {SAVE.pro}%)</span></> : "Monthly"}
          </button>
        ))}
      </div>
      <Card plan="basic" />
      <Card plan="pro" highlight />
      <Link className="text-sm underline opacity-80" href="/pricing">See all plans</Link>
    </div>
  );
}

