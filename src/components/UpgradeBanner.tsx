"use client";
import { startSubscriptionCheckout } from "@/utils/checkout";

export interface UpgradeBannerProps {
  visible: boolean;
  estimatedMinutes: number;
  email: string;
  onEmailChange: (e: string) => void;
  onDismiss: () => void;
  onVerifyEmail: () => void;
}

export default function UpgradeBanner({ visible, estimatedMinutes, email, onEmailChange, onDismiss, onVerifyEmail }: UpgradeBannerProps) {
  if (!visible) return null;
  return (
    <div className={`upgrade-banner${visible ? " visible" : ""}`}>
      <div className="upgrade-banner-inner">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Enjoying the listen?</h2>
            <p style={{ fontSize: 14, color: "var(--muted)", fontFamily: "var(--font-ui)" }}>
              You&apos;ve heard 60 seconds.{estimatedMinutes > 0 && ` The full text is ~${estimatedMinutes} min.`} Subscribe to unlock unlimited listening.
            </p>
          </div>
          <button className="btn btn-sm" onClick={onDismiss} aria-label="Dismiss" style={{ fontFamily: "var(--font-ui)", marginLeft: 12 }}>✕</button>
        </div>

        <div className="upgrade-plan-grid">
          {/* Weekly */}
          <div className="upgrade-plan-card">
            <div style={{ fontFamily: "var(--font-ui)" }}>
              <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>Weekly</div>
              <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>$2.99<span style={{ fontSize: 14, fontWeight: 400, color: "var(--muted)" }}>/wk</span></div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>Try it</div>
              <ul style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, listStyle: "none", paddingLeft: 0 }}>
                <li>✓ Unlimited listening</li><li>✓ All voices</li><li>✓ All themes</li>
              </ul>
              <input className="btn-input" type="email" placeholder="your@email.com" value={email} onChange={(e) => onEmailChange(e.target.value)} style={{ marginBottom: 8, fontSize: 14 }} />
              <button className="btn" style={{ width: "100%", fontFamily: "var(--font-ui)" }} onClick={() => startSubscriptionCheckout("weekly", email)}>Get Weekly — $2.99/wk</button>
            </div>
          </div>

          {/* Monthly */}
          <div className="upgrade-plan-card popular" style={{ position: "relative" }}>
            <span className="plan-badge">Most Popular</span>
            <div style={{ fontFamily: "var(--font-ui)" }}>
              <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>Monthly</div>
              <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>$1.99<span style={{ fontSize: 14, fontWeight: 400, color: "var(--muted)" }}>/wk</span></div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>Billed $7.99/month · Save 33%</div>
              <ul style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, listStyle: "none", paddingLeft: 0 }}>
                <li>✓ Everything in Weekly</li><li>✓ Export MP3</li><li>✓ Library sync</li>
              </ul>
              <input className="btn-input" type="email" placeholder="your@email.com" value={email} onChange={(e) => onEmailChange(e.target.value)} style={{ marginBottom: 8, fontSize: 14 }} />
              <button className="btn btn-primary" style={{ width: "100%", fontFamily: "var(--font-ui)" }} onClick={() => startSubscriptionCheckout("monthly", email)}>Get Monthly — $1.99/wk</button>
            </div>
          </div>

          {/* Yearly */}
          <div className="upgrade-plan-card best-value">
            <div style={{ fontFamily: "var(--font-ui)" }}>
              <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>Yearly</div>
              <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>$0.96<span style={{ fontSize: 14, fontWeight: 400, color: "var(--muted)" }}>/wk</span></div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>Billed $49.99/year · Save 68%</div>
              <ul style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, listStyle: "none", paddingLeft: 0 }}>
                <li>✓ Everything in Monthly</li><li>✓ Embed code</li><li>✓ Priority quality</li>
              </ul>
              <input className="btn-input" type="email" placeholder="your@email.com" value={email} onChange={(e) => onEmailChange(e.target.value)} style={{ marginBottom: 8, fontSize: 14 }} />
              <button className="btn" style={{ width: "100%", fontFamily: "var(--font-ui)" }} onClick={() => startSubscriptionCheckout("yearly", email)}>Get Yearly — $0.96/wk</button>
            </div>
          </div>
        </div>

        <p style={{ textAlign: "center", fontSize: 13, color: "var(--muted)", marginTop: 16, fontFamily: "var(--font-ui)" }}>
          Already subscribed?{" "}
          <button style={{ textDecoration: "underline", cursor: "pointer", background: "none", border: "none", color: "var(--muted)", fontFamily: "var(--font-ui)", fontSize: 13 }} onClick={onVerifyEmail}>
            Enter your email to verify
          </button>
        </p>
      </div>
    </div>
  );
}
