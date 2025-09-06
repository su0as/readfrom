"use client";

import React, { useState } from "react";
import PricingPageContent from "@/components/PricingPageContent";
import { Billing, Plan, startCheckout } from "@/utils/checkout";

export const dynamic = "force-dynamic";

export default function PricingPage() {
  const [billing, setBilling] = useState<Billing>("monthly");
  const [email, setEmail] = useState<string>("");

  const onCheckout = (p: Plan, b: Billing, em?: string) => {
    startCheckout(p, b, em || email || undefined);
  };

  return (
    <main className="container p-6 flex flex-col gap-8 fancyOverlay">
      <header className="text-center">
        <h1 className="text-3xl md:text-5xl font-semibold">Listen to what you read</h1>
        <p className="opacity-80 mt-2">Turn any text into natural speech with word-level highlighting and exports.</p>
      </header>

      <PricingPageContent
        billing={billing}
        onBillingChange={setBilling}
        email={email}
        onEmailChange={setEmail}
        onCheckout={onCheckout}
      />

      <footer className="text-center">
        <div className="card inline-flex flex-col items-center gap-3 p-6">
          <h3 className="text-xl font-semibold">Ready to narrate your text?</h3>
          <div className="flex flex-wrap justify-center gap-2">
            <input className="btn-input" type="email" name="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button type="button" className="btn btn-primary" onClick={() => onCheckout('pro', billing, email)}>Subscribe</button>
          </div>
          <div className="text-sm opacity-70">Cancel anytime. No long-term contracts.</div>
        </div>
      </footer>
    </main>
  );
}

