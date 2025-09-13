Security hardening overview

This document summarizes the security posture and controls in this app and how to operate them safely in production.

Threat model highlights
- Data handled: User-provided text for synthesis, email for entitlement lookup, export specifications.
- Trust boundaries: Browser ↔ API routes ↔ third-party APIs (Google TTS, Whop). Redis (Upstash) when configured.
- Main risks: Credential exposure in client bundles, abusive usage of TTS (DoS/cost), insecure webhook processing, cross-site requests, clickjacking.

Key controls
- Rate limiting: All public API routes are protected with IP-based sliding window limits (Upstash-backed when configured, in-memory fallback for dev).
- Same-origin enforcement: Browser-initiated APIs validate the Origin header and reject cross-site requests.
- Webhook signature verification: If WHOP_WEBHOOK_SECRET is set, webhook payloads are verified with HMAC-SHA256 over the raw body and processed idempotently.
- Cookies: rf_email is set via a server endpoint as an HttpOnly cookie, SameSite=Lax, Secure in production.
- Security headers: HSTS (prod), Referrer-Policy, COOP/CORP, Permissions-Policy, and a Content-Security-Policy (report-only by default).
- Clickjacking: frame-ancestors 'none' globally via CSP; the /embed/* route overrides CSP to allow framing.
- Secrets hygiene: A post-build scanner fails the build if secret-like tokens are present in client bundles.

Operations guidance
- Rotate WHOP_WEBHOOK_SECRET regularly; rotation requires updating the provider and this environment variable.
- Tune rate limits in src/utils/rateLimit.ts usage per route based on observed traffic and cost budgets.
- Start CSP in report-only (default). After validating in production logs that there are no breaking violations, set CSP_REPORT_ONLY=0 and redeploy.
- Keep GOOGLE_PRIVATE_KEY with escaped newlines in env (.env.local) or use a secure secrets manager.
- Ensure all deployments are served over HTTPS so HSTS applies and Secure cookies are honored.

Disclosure
If you believe you have found a security vulnerability, please open a private security report or contact the maintainers. Do not file public issues with undisclosed details.