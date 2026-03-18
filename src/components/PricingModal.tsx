"use client";

import React, { useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import Pricing from "@/components/Pricing";

export default function PricingModal({
  open,
  email,
  onClose,
  context = "generic",
}: {
  open: boolean;
  email?: string;
  onClose: () => void;
  context?: "play" | "preview-expired" | "sidebar" | "generic";
}) {
  const lastActive = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Focus trap
  useEffect(() => {
    if (!open) return;
    lastActive.current = (document.activeElement as HTMLElement) || null;
    const el = dialogRef.current;
    if (!el) return;
    const focusables = () =>
      Array.from(
        el.querySelectorAll<HTMLElement>(
          "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])",
        ),
      );
    const first = focusables()[0];
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const list = focusables();
        if (!list.length) return;
        const i = list.indexOf(document.activeElement as HTMLElement);
        const dir = e.shiftKey ? -1 : 1;
        const next = (i + dir + list.length) % list.length;
        e.preventDefault();
        list[next].focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      lastActive.current?.focus?.();
    };
  }, [open, onClose]);

  if (typeof document === "undefined" || !open) return null;

  const body = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pricing-title"
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg)",
          color: "var(--fg)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          position: "absolute",
          inset: "10% 50% auto 50%",
          transform: "translateX(-50%)",
          width: "min(960px, 90vw)",
          maxHeight: "80vh",
          overflowY: "auto",
          padding: 16,
        }}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 id="pricing-title" className="text-xl font-semibold">
              {context === "play"
                ? "Preview playing\u2026 Unlock full narration"
                : "Choose a plan"}
            </h2>
            {context === "preview-expired" && (
              <p className="opacity-80">
                Your preview ended. Continue listening with a subscription.
              </p>
            )}
          </div>
          <button className="btn" aria-label="Close pricing" onClick={onClose}>
            Close
          </button>
        </div>

        <Pricing email={email} onClose={onClose} />
      </div>
    </div>
  );

  return ReactDOM.createPortal(body, document.body);
}
