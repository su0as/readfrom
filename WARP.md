# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

Project overview

- Stack: Next.js (App Router) + TypeScript + Tailwind v4 (via PostCSS) + Vitest
- Package manager: pnpm (pnpm-lock.yaml present)
- Notable integrations: Google Cloud Text-to-Speech, Upstash (Redis + Ratelimit), Sentry

Common commands

- Install: pnpm install
- Dev server: pnpm dev (opens http://localhost:3000)
- Build: pnpm build
- Start (after build): pnpm start
- Type-check: pnpm typecheck
- Lint:
  - Whole repo: pnpm run lint -- .
  - Single file: pnpm run lint -- src/app/page.tsx
- Format: pnpm format
- Tests (Vitest):
  - All tests (CI mode): pnpm test
  - Watch mode: pnpm test:watch
  - Single file: pnpm test path/to/file.test.ts
  - Filter by name: pnpm test -t "name or pattern"

Environment
Set these in .env.local for local development (values are not included here):

- Google Cloud TTS (required for /api/tts to work)
  - GOOGLE_PROJECT_ID
  - GOOGLE_CLIENT_EMAIL
  - GOOGLE_PRIVATE_KEY (use escaped newlines if storing in env; server replaces \n)
- Upstash (optional; falls back to in-memory in dev)
  - UPSTASH_REDIS_REST_URL
  - UPSTASH_REDIS_REST_TOKEN
- Entitlements (optional convenience for dev)
  - DEV_ENTITLED_EMAILS=you@example.com,other@example.com
- Preview controls and checkout URL
  - PREVIEW_SECONDS=30 (server-side default if preview mode is used)
  - NEXT_PUBLIC_PREVIEW_SECONDS=30 (client-side UI uses this)
  - NEXT_PUBLIC_WHOP_CHECKOUT_URL=https://… (used by checkout flow)
- Sentry (optional)
  - SENTRY_DSN
  - NEXT_PUBLIC_SENTRY_DSN
- Debug (optional)
  - DEBUG_TTS=1 (logs TTS server-side diagnostics)

High-level architecture

- App Router UI (src/app)
  - Root layout (src/app/layout.tsx) wires global CSS and font. A single page (src/app/page.tsx) implements the text reader UI. The client tokenizes text into "word" and "separator" tokens with stable word indices that match server-side tokenization. It requests audio segments from /api/tts, progressively appends segments, probes actual durations in the browser, and keeps word-level highlighting synchronized as playback progresses. It auto-falls back from OGG to MP3 if decoding fails. A preview flow limits playback length for non-entitled users and opens a simple checkout modal. A return page (src/app/checkout/return/page.tsx) links purchases to an email cookie (rf_email) and verifies entitlement via /api/entitlements.
- TTS service (src/app/api/tts/route.ts, runtime: nodejs)
  - Validates input with zod, rate-limits by IP, and enforces preview limits when the user is not entitled.
  - Tokenizes the input text (same rules as client) and chunks primarily by sentence boundaries with byte-size safety limits. Supports multiple response formats:
    - bundle (default): returns base64 audio segments plus word timepoints (when marks are requested)
    - audio: audio segments only
    - marks: timepoints only (no audio)
  - For Google's "Chirp 3 HD" voices (en-US/en-GB), it synthesizes audio in the target voice but may synthesize reference marks with a Neural2 voice to derive accurate word timings. Audio durations are extracted with music-metadata. Supports both OGG (Opus) and MP3 containers.
- Rate limiting (src/utils/rateLimit.ts)
  - Uses Upstash Ratelimit when credentials are present; otherwise falls back to an in-memory sliding window limiter for development.
- Entitlements (src/utils/entitlements.ts; routes: src/app/api/entitlements/route.ts, src/app/api/whop/webhook/route.ts)
  - Minimal entitlement store keyed by email. Uses Upstash Redis when configured; otherwise stores in-memory (dev only). The webhook handler is a scaffold that extracts an email from common fields and marks status active/canceled. The GET /api/entitlements endpoint resolves entitlement from the rf_email cookie or query param and returns the current record.
- Observability and security
  - Sentry is initialized via src/instrumentation.ts and src/instrumentation-client.ts when DSNs are set. next.config.ts adds conservative security headers globally.

Notes to operators

- Missing Google TTS credentials will cause /api/tts to return 500 with message: "Server not configured: set GOOGLE_PROJECT_ID, GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY". The UI will still load; synthesis requests will fail until credentials are provided.
- Without Upstash credentials, rate limiting and entitlements work in-memory only (suitable for single-process local dev, not shared environments).

Key files and entry points

- package.json (scripts)
- next.config.ts (headers, Sentry wrapper)
- eslint.config.mjs (flat config; run eslint with explicit paths)
- src/app/page.tsx (reader UI, playback, progressive fetch)
- src/app/api/tts/route.ts (synthesis and timing)
- src/utils/{rateLimit,entitlements}.ts (infra utilities)
- src/app/api/entitlements/route.ts and src/app/api/whop/webhook/route.ts (entitlement and webhook endpoints)

Existing guidelines found in repo

- README.md is the standard create-next-app template; no additional tool-specific rules (Claude/Cursor/Copilot) were found.
