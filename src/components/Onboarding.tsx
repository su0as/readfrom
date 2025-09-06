"use client";

import React, { useEffect, useRef, useState } from "react";

export default function Onboarding({
  openDefault = true,
  onClose,
}: {
  openDefault?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState<boolean>(false);
  const onceKey = "rf_onboard_seen_v1";
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = localStorage.getItem(onceKey) === "1";
    if (!seen && openDefault) setOpen(true);
  }, [openDefault]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { close(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    try { localStorage.setItem(onceKey, "1"); } catch {}
    setOpen(false);
    onClose?.();
  }

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 120 }} onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onb-title"
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ position: "absolute", inset: "auto 50% 10% 50%", transform: "translateX(-50%)", width: "min(720px, 92vw)" }}
      >
        <h2 id="onb-title" className="text-xl font-semibold mb-2">Welcome to ReadFrom</h2>
        <p className="opacity-80 mb-4">Turn any text into natural speech. Here’s a 20‑second tour:</p>
        <ol className="list-decimal ml-5 space-y-2 opacity-90">
          <li>Paste text into the editor. Switch to Read to listen with word‑level highlighting.</li>
          <li>Use the right sidebar to Play/Pause, change voice and speed, import TXT/PDF, and tweak the theme and layout.</li>
          <li>Not subscribed yet? Press Play to hear a preview, then upgrade to unlock full narration and exports.</li>
        </ol>
        <div className="flex gap-2 mt-4">
          <button className="btn" onClick={close}>Got it</button>
          <a className="btn" href="/pricing">See pricing</a>
        </div>
      </div>
    </div>
  );
}

