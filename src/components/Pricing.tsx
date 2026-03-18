"use client";

import React, { useState } from "react";
import { SubscriptionPlan, startSubscriptionCheckout, isCheckoutConfigured } from "@/utils/checkout";

type Props = {
  email?: string;
  onClose?: () => void;
};

type PlanConfig = {
  plan: SubscriptionPlan;
  label: string;
  weeklyEquivalent: string;
  billingPrice: string;
  billingLabel: string;
  savingsBadge: string | null;
  highlight: boolean;
  badgeLabel: string | null;
};

const PLANS: PlanConfig[] = [
  {
    plan: "weekly",
    label: "Weekly",
    weeklyEquivalent: "$2.99/wk",
    billingPrice: "$2.99",
    billingLabel: "billed $2.99/week",
    savingsBadge: null,
    highlight: false,
    badgeLabel: null,
  },
  {
    plan: "monthly",
    label: "Monthly",
    weeklyEquivalent: "$1.99/wk",
    billingPrice: "$7.99",
    billingLabel: "billed $7.99/month",
    savingsBadge: "save 33%",
    highlight: true,
    badgeLabel: "Most Popular",
  },
  {
    plan: "yearly",
    label: "Yearly",
    weeklyEquivalent: "$0.96/wk",
    billingPrice: "$49.99",
    billingLabel: "billed $49.99/year",
    savingsBadge: "save 68%",
    highlight: false,
    badgeLabel: "Best Value",
  },
];

function PlanCard({
  config,
  email,
}: {
  config: PlanConfig;
  email: string;
}) {
  const configured = isCheckoutConfigured();
  const emailValid = /.+@.+\..+/.test(email.trim());
  const canCheckout = configured && emailValid;

  return (
    <div
      className={`card flex flex-col gap-3 ${config.highlight ? "ring-2 ring-[var(--accent)] card-popular" : ""}`}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">{config.label}</h3>
        {config.badgeLabel && (
          <span className="badge">{config.badgeLabel}</span>
        )}
      </div>

      <div className="flex items-end gap-2">
        <span className="text-4xl font-bold price">{config.weeklyEquivalent}</span>
      </div>

      <div className="text-sm opacity-70">{config.billingLabel}</div>

      {config.savingsBadge && (
        <div className="inline-flex items-center badge-sale w-fit" aria-label={config.savingsBadge}>
          {config.savingsBadge}
        </div>
      )}

      <button
        className="btn mt-2"
        disabled={!canCheckout}
        title={
          !configured
            ? "Checkout not configured"
            : !emailValid
            ? "Enter a valid email to continue"
            : `Subscribe ${config.label}`
        }
        onClick={() => {
          if (canCheckout) {
            startSubscriptionCheckout(config.plan, email.trim());
          }
        }}
        aria-label={`Subscribe to ${config.label} plan`}
      >
        Get {config.label}
      </button>
    </div>
  );
}

export default function Pricing({ email: initialEmail = "", onClose }: Props) {
  const [email, setEmail] = useState<string>(initialEmail);

  return (
    <div className="flex flex-col gap-8">
      <div className="text-center">
        <h2 className="text-2xl md:text-4xl font-semibold">
          Plans to maximize your focus
        </h2>
        <p className="opacity-80 mt-2">
          Start weekly, save more with monthly or yearly billing.
        </p>
      </div>

      <div className="flex flex-col gap-2 max-w-sm mx-auto w-full">
        <input
          className="btn"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Your email"
        />
        {email.length > 0 && !/.+@.+\..+/.test(email.trim()) && (
          <div className="text-sm opacity-80" role="alert">
            Enter a valid email to continue
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {PLANS.map((config) => (
          <PlanCard key={config.plan} config={config} email={email} />
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h4 className="font-semibold mb-2">Can I cancel anytime?</h4>
          <p className="opacity-80">
            Yes. Subscriptions can be canceled any time; access continues until
            the end of the paid period.
          </p>
        </div>
        <div className="card">
          <h4 className="font-semibold mb-2">What&apos;s included in the preview?</h4>
          <p className="opacity-80">
            Non-entitled users can listen to a short preview to try the voice
            and pacing.
          </p>
        </div>
        <div className="card">
          <h4 className="font-semibold mb-2">Do you support exports?</h4>
          <p className="opacity-80">
            Yes — subscribers get MP3/WAV exports and an embeddable player code.
          </p>
        </div>
        <div className="card">
          <h4 className="font-semibold mb-2">Is there a refund policy?</h4>
          <p className="opacity-80">
            We keep it simple: if something goes wrong, reach out and we&apos;ll make
            it right.
          </p>
        </div>
      </div>

      {onClose && (
        <div className="text-center">
          <button className="btn" onClick={onClose} aria-label="Close pricing">
            Close
          </button>
        </div>
      )}
    </div>
  );
}
