Operations guide

Install and run
- pnpm install
- pnpm build
- pnpm start
- Local dev: pnpm dev (http://localhost:3000)

Environment variables
See .env.example for the complete list. Required for TTS:
- GOOGLE_PROJECT_ID
- GOOGLE_CLIENT_EMAIL
- GOOGLE_PRIVATE_KEY (use escaped \n newlines)

Optional
- Upstash Redis (rate limit and entitlement persistence)
- Sentry (SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN)
- Whop API (WHOP_API_KEY) and webhook verification (WHOP_WEBHOOK_SECRET)
- NEXT_PUBLIC_SITE_URL (for SEO and canonical URLs)

Security posture
- Rate limits are enforced by src/utils/rateLimit.ts. Adjust per-route parameters as needed.
- CSP starts in Report-Only. Set CSP_REPORT_ONLY=0 to enforce after validating logs.
- The rf_email cookie is set via /api/cookies/email with HttpOnly and Secure=true in production.

Quality checks
- Typecheck: pnpm typecheck
- Lint: pnpm run lint -- .
- Tests: pnpm test
- Post-build secret scan: pnpm run secrets:scan (runs automatically if wired to CI)

Deployment
- Use Node 18+ (Node 20 recommended). Ensure HTTPS and correct environment variables.
- Monitor Sentry for error rates and performance. Roll back if regressions appear.