"use client";

import { useEffect, useMemo, useState } from "react";

export default function CheckoutReturnPage() {
  const [email, setEmail] = useState<string>("");
  const [status, setStatus] = useState<"checking" | "entitled" | "not_found" | "error">("checking");
  const [message, setMessage] = useState<string>("Verifying your purchase…");

  const redirectHome = () => { window.location.href = "/"; };

  const search = useMemo(() => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null), []);

  useEffect(() => {
    if (!search) return;
    const em = search.get("email") || "";
    if (em) {
      setEmail(em);
      try { document.cookie = `rf_email=${encodeURIComponent(em)}; Path=/; SameSite=Lax`; } catch {}
    }
    const toCheck = em || (typeof document !== 'undefined' ? (document.cookie.match(/(?:^|; )rf_email=([^;]+)/)?.[1] && decodeURIComponent(document.cookie.match(/(?:^|; )rf_email=([^;]+)/)![1])) : "");
    if (!toCheck) {
      setStatus("not_found");
      setMessage("Enter your email to link your purchase.");
      return;
    }
    (async () => {
      try {
        const r = await fetch(`/api/entitlements?email=${encodeURIComponent(toCheck)}`);
        const j = await r.json();
        if (j?.entitled) {
          setStatus("entitled");
          setMessage("All set — your access is unlocked.");
          setTimeout(redirectHome, 1000);
        } else {
          setStatus("not_found");
          setMessage("We couldn't find an active purchase for this email. Try another email or contact support.");
        }
      } catch (e: unknown) {
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "Verification failed.");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search?.toString()]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ gap: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 600 }}>Thanks for your purchase</h1>
      <p style={{ opacity: 0.85 }}>{message}</p>

      {(status === "not_found" || status === "error") && (
        <div style={{ display: 'flex', gap: 8, width: 420, maxWidth: '90%' }}>
          <input
            className="btn"
            style={{ flex: 1 }}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            className="btn"
            onClick={async () => {
              const em = email.trim();
              if (!em) return;
              try { document.cookie = `rf_email=${encodeURIComponent(em)}; Path=/; SameSite=Lax`; } catch {}
              setStatus("checking");
              setMessage("Verifying your purchase…");
              try {
                const r = await fetch(`/api/entitlements?email=${encodeURIComponent(em)}`);
                const j = await r.json();
                if (j?.entitled) {
                  setStatus("entitled");
                  setMessage("All set — your access is unlocked.");
                  setTimeout(redirectHome, 1000);
                } else {
                  setStatus("not_found");
                  setMessage("We couldn't find an active purchase for this email. Try another email.");
                }
              } catch (e: unknown) {
                setStatus("error");
                setMessage(e instanceof Error ? e.message : "Verification failed.");
              }
            }}
          >Link</button>
        </div>
      )}

      {status === "entitled" && (
        <button className="btn" onClick={redirectHome}>Continue</button>
      )}
    </div>
  );
}

