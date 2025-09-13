"use client";

import Pricing from "@/components/Pricing";
import { useState } from "react";
import { Billing, Plan, startCheckout } from "@/utils/checkout";

export default function PricingClient() {
  const [plan, setPlan] = useState<Plan>("pro");
  const [billing, setBilling] = useState<Billing>("yearly");
  const [email, setEmail] = useState<string>("");

  return (
    <main className="container p-6">
      <h1 className="text-3xl font-semibold mb-4">Pricing</h1>
      <Pricing
        selectedPlan={plan}
        billing={billing}
        onPlanChange={setPlan}
        onBillingChange={setBilling}
        onCheckout={(p, b, em) => startCheckout(p, b, em || email)}
        email={email}
        onEmailChange={setEmail}
        showComparison
        showFAQ
        showSocialProof
      />
    </main>
  );
}