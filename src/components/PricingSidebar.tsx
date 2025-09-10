"use client";

import React from "react";
import { Billing, Plan } from "@/utils/checkout";
import { useUsdToLocal } from "@/utils/currency";
import Link from "next/link";

const PRICES = {
  basic: { monthly: 4.99, yearly: 39.99 },
  pro: { monthly: 9.99, yearly: 79.99 },
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
  entitled = false,
  onVerified,
}: {
  billing: Billing;
  onBillingChange: (b: Billing) => void;
  email: string;
  onEmailChange: (v: string) => void;
  onCheckout: (p: Plan, b: Billing, email: string) => void;
  entitled?: boolean;
  onVerified?: (info?: { planId?: string; periodEnd?: number }) => void;
}) {
  const { format } = useUsdToLocal();

  const Card = ({ plan, highlight }: { plan: Plan; highlight?: boolean }) => {
    const usd = PRICES[plan][billing];
    const { primary, anchor } = format(usd);
    const savings = billing === "yearly" ? SAVE[plan] : 0;
    const features = plan === "basic"
      ? ["Word highlighting", "Multiple voices"]
      : ["Everything in Basic", "Export MP3/WAV"];
    const ref = React.useRef<HTMLInputElement | null>(null);

    return (
      <div className={`card ${highlight ? "card-popular" : ""}`}>
        <div className="mb-2">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold capitalize">{plan}</h4>
            {highlight && <span className="badge">Recommended</span>}
          </div>
        </div>
        <div className="text-2xl price">{primary}</div>
        {anchor && <div className="text-sm opacity-70">≈ {anchor} USD</div>}
        {savings > 0 && <div className="badge-sale mt-2">Save {savings}%</div>}

        <div className="mt-4 space-y-2">
          <input ref={ref} className="btn-input" type="email" name="email" inputMode="email" autoComplete="email" placeholder="you@example.com" defaultValue={email} aria-label="Your email" />
          <button type="button" className="btn btn-primary w-full" onClick={() => { const em = (ref.current?.value || '').trim(); if (!/.+@.+\..+/.test(em)) return; onEmailChange(em); onCheckout(plan, billing, em); }}>Subscribe</button>
          <button type="button" className="btn w-full" onClick={async () => {
            const em = (ref.current?.value || '').trim(); if (!/.+@.+\..+/.test(em)) return;
            try {
              await fetch('/api/whop/verify', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email: em })});
              const r = await fetch(`/api/entitlements?email=${encodeURIComponent(em)}`);
              const j = await r.json();
              if (j?.entitled) {
                try { localStorage.setItem('rf_email_last', em); } catch {}
                onEmailChange(em);
                onVerified?.(j?.entitlement ? { planId: j.entitlement.planId, periodEnd: j.entitlement.periodEnd } : undefined);
                alert('Verified. Reloading…');
                try { window.location.reload(); } catch {}
              } else {
                alert('No active purchase found for this email.');
              }
            } catch (e) {
              alert('Verification failed');
            }
          }}>Verify now</button>
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
      {entitled && (
        <div className="badge" title="Your plan is active">Active plan</div>
      )}
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

