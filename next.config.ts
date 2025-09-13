import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import path from "path";

const isProd = process.env.NODE_ENV === "production";

// Content Security Policy
// Start in Report-Only to catch violations; flip to enforce after validation.
const csp = [
  "default-src 'self'",
  // Next.js and analytics may inject small inline scripts; keep 'unsafe-inline' while evaluating nonce adoption.
  "script-src 'self' 'unsafe-inline' https: 'report-sample'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  // Next/font is self-hosted, but allow Google Fonts domains if used.
  "font-src 'self' https://fonts.gstatic.com https://fonts.googleapis.com",
  // Client connects to same-origin APIs and Vercel analytics endpoints.
  "connect-src 'self' https://api.whop.com https://vitals.vercel-insights.com https://vitals.vercel-analytics.com",
  "media-src 'self' data: blob:",
  // Frame embedding is disabled globally; embed route overrides via route-specific header below.
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Implicit upgrade to https for all requests in modern browsers
  "upgrade-insecure-requests",
].join("; ");

const securityHeadersGlobal = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Prefer CSP frame-ancestors over X-Frame-Options for modern browsers; omit XFO globally to allow per-route CSP overrides.
  // { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: [
    "accelerometer=()",
    "ambient-light-sensor=()",
    "autoplay=(self)",
    "camera=()",
    "clipboard-read=(self)",
    "clipboard-write=(self)",
    "geolocation=()",
    "gyroscope=()",
    "magnetometer=()",
    "microphone=()",
    "midi=()",
    "payment=()",
    "sync-xhr=()",
    "usb=()",
    "fullscreen=(self)",
  ].join(", ") },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" } as const] : []),
  // Start CSP in Report-Only unless CSP_REPORT_ONLY=0
  process.env.CSP_REPORT_ONLY === "0"
    ? { key: "Content-Security-Policy", value: csp }
    : { key: "Content-Security-Policy-Report-Only", value: csp },
];

// Embed route overrides: allow framing on any origin for public embeds.
const embedHeaders = [
  // Override CSP to allow framing by any site on /embed/* only
  process.env.CSP_REPORT_ONLY === "0"
    ? { key: "Content-Security-Policy", value: csp.replace("frame-ancestors 'none'", "frame-ancestors *") }
    : { key: "Content-Security-Policy-Report-Only", value: csp.replace("frame-ancestors 'none'", "frame-ancestors *") },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeadersGlobal },
      { source: "/embed/:path*", headers: embedHeaders },
    ];
  },
};

export default withSentryConfig(nextConfig, { silent: true });
