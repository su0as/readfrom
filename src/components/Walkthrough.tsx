"use client";

import { useEffect, useRef, useState } from "react";

interface Step {
  tour: string;
  title: string;
  body: string;
  placement: "bottom" | "top" | "left" | "right";
}

const STEPS: Step[] = [
  {
    tour: "url-input",
    title: "Paste a URL",
    body: "Drop in any article, blog post, or web page link and we'll extract the text for you.",
    placement: "bottom",
  },
  {
    tour: "text-editor",
    title: "Your reading area",
    body: "Paste any text here — articles, reports, emails, anything. Words light up as they're read aloud.",
    placement: "top",
  },
  {
    tour: "play-btn",
    title: "Press Play",
    body: "Hit Play (or Space) to start listening. Pause and resume without losing your spot.",
    placement: "bottom",
  },
  {
    tour: "voice-select",
    title: "Pick a voice",
    body: "Choose from high-quality Chirp 3 HD voices. Changes take effect on the next play.",
    placement: "bottom",
  },
  {
    tour: "speed-control",
    title: "Reading speed",
    body: "Dial up to 2× for faster listening or slow down to 0.75× when every word matters.",
    placement: "bottom",
  },
  {
    tour: "theme-toggle",
    title: "Eye comfort",
    body: "Switch between light, sepia, and dark themes to match your environment.",
    placement: "bottom",
  },
  {
    tour: "file-import",
    title: "Import files",
    body: "Upload a PDF or EPUB and jump straight to listening — no copy-paste needed.",
    placement: "top",
  },
];

const STORAGE_KEY = "rf_tour_done";

function getRect(tour: string): DOMRect | null {
  const el = document.querySelector(`[data-tour="${tour}"]`);
  return el ? el.getBoundingClientRect() : null;
}

interface TooltipPos {
  top: number;
  left: number;
  arrowSide: "top" | "bottom" | "left" | "right";
}

function computeTooltipPos(
  rect: DOMRect,
  placement: Step["placement"],
  tooltipW: number,
  tooltipH: number,
  gap: number,
): TooltipPos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top = 0;
  let left = 0;
  let arrowSide: TooltipPos["arrowSide"] = "top";

  if (placement === "bottom") {
    top = rect.bottom + gap;
    left = rect.left + rect.width / 2 - tooltipW / 2;
    arrowSide = "top";
  } else if (placement === "top") {
    top = rect.top - tooltipH - gap;
    left = rect.left + rect.width / 2 - tooltipW / 2;
    arrowSide = "bottom";
  } else if (placement === "right") {
    top = rect.top + rect.height / 2 - tooltipH / 2;
    left = rect.right + gap;
    arrowSide = "left";
  } else {
    top = rect.top + rect.height / 2 - tooltipH / 2;
    left = rect.left - tooltipW - gap;
    arrowSide = "right";
  }

  // Clamp to viewport
  left = Math.max(12, Math.min(vw - tooltipW - 12, left));
  top = Math.max(12, Math.min(vh - tooltipH - 12, top));

  return { top, left, arrowSide };
}

export default function Walkthrough() {
  const [step, setStep] = useState<number>(0);
  const [visible, setVisible] = useState<boolean>(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPos | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  // Check if tour was already completed
  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  // Update spotlight rect when step changes or window resizes
  useEffect(() => {
    if (!visible) return;
    const update = () => {
      const r = getRect(STEPS[step].tour);
      setRect(r);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [step, visible]);

  // Compute tooltip position after rect and tooltip size are known
  useEffect(() => {
    if (!rect || !tooltipRef.current) return;
    const tw = tooltipRef.current.offsetWidth || 260;
    const th = tooltipRef.current.offsetHeight || 120;
    setTooltipPos(computeTooltipPos(rect, STEPS[step].placement, tw, th, 12));
  }, [rect, step]);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
  };

  const next = () => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      dismiss();
    }
  };

  const prev = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  if (!visible) return null;

  const PADDING = 6;

  return (
    <>
      {/* Backdrop with cutout */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
          pointerEvents: "auto",
        }}
        onClick={dismiss}
        aria-hidden="true"
      >
        <svg
          width="100%"
          height="100%"
          style={{ position: "absolute", inset: 0 }}
        >
          <defs>
            <mask id="wt-cutout">
              <rect width="100%" height="100%" fill="white" />
              {rect && (
                <rect
                  x={rect.left - PADDING}
                  y={rect.top - PADDING}
                  width={rect.width + PADDING * 2}
                  height={rect.height + PADDING * 2}
                  rx={6}
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(0,0,0,0.55)"
            mask="url(#wt-cutout)"
          />
        </svg>
      </div>

      {/* Highlight ring */}
      {rect && (
        <div
          style={{
            position: "fixed",
            zIndex: 9999,
            top: rect.top - PADDING,
            left: rect.left - PADDING,
            width: rect.width + PADDING * 2,
            height: rect.height + PADDING * 2,
            borderRadius: 8,
            boxShadow: "0 0 0 2px var(--accent, #6c63ff)",
            pointerEvents: "none",
          }}
          aria-hidden="true"
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        role="dialog"
        aria-modal="false"
        aria-label={`Tour step ${step + 1} of ${STEPS.length}: ${STEPS[step].title}`}
        style={{
          position: "fixed",
          zIndex: 10000,
          top: tooltipPos?.top ?? -9999,
          left: tooltipPos?.left ?? -9999,
          width: 260,
          background: "var(--bg, #fff)",
          color: "var(--fg, #111)",
          border: "1px solid var(--border, #ddd)",
          borderRadius: 10,
          padding: "14px 16px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
          fontFamily: "var(--font-ui)",
          animation: "wt-fade-in 0.18s ease",
          pointerEvents: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Step counter */}
        <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 6 }}>
          {step + 1} / {STEPS.length}
        </div>

        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
          {STEPS[step].title}
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.8, marginBottom: 14 }}>
          {STEPS[step].body}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {step > 0 && (
            <button
              className="btn btn-sm"
              onClick={prev}
              style={{ fontFamily: "var(--font-ui)", minWidth: 52 }}
            >
              Back
            </button>
          )}
          <button
            className="btn btn-primary btn-sm"
            onClick={next}
            style={{ fontFamily: "var(--font-ui)", minWidth: 52 }}
          >
            {step === STEPS.length - 1 ? "Done" : "Next"}
          </button>
          <button
            className="btn btn-sm"
            onClick={dismiss}
            style={{
              fontFamily: "var(--font-ui)",
              marginLeft: "auto",
              opacity: 0.6,
              minWidth: 42,
            }}
          >
            Skip
          </button>
        </div>
      </div>
    </>
  );
}
