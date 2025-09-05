"use client";

import React, { useMemo, useState } from "react";
import Pricing from "@/components/Pricing";
import { Billing, Plan, startCheckout } from "@/utils/checkout";

export const dynamic = "force-dynamic";

export default function PricingPage() {
  const [plan, setPlan] = useState<Plan>("pro");
  const [billing, setBilling] = useState<Billing>("yearly");
  const [email, setEmail] = useState<string>("");

  const onCheckout = (p: Plan, b: Billing, em?: string) => {
    startCheckout(p, b, em || email || undefined);
  };

  return (
    <main className="container p-6 flex flex-col gap-8">
      <header className="text-center">
        <h1 className="text-3xl md:text-5xl font-semibold">Listen to what you read</h1>
        <p className="opacity-80 mt-2">Turn any text into natural speech with word-level highlighting and exports.</p>
      </header>

      <Pricing
        selectedPlan={plan}
        billing={billing}
        onPlanChange={setPlan}
        onBillingChange={setBilling}
        onCheckout={onCheckout}
        email={email}
        onEmailChange={setEmail}
        showComparison
        showFAQ
        showSocialProof
      />

      <footer className="text-center">
        <div className="card inline-flex flex-col items-center gap-3 p-6">
          <h3 className="text-xl font-semibold">Ready to narrate your text?</h3>
          <div className="flex flex-wrap justify-center gap-2">
            <input className="btn" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn" onClick={() => onCheckout(plan, billing, email)}>Subscribe</button>
          </div>
          <div className="text-sm opacity-70">Cancel anytime. No long-term contracts.</div>
        </div>
      </footer>
    </main>
  );
}

