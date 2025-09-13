SEO guide

What’s implemented
- robots.txt and sitemap.xml are generated via App Router exports.
- Canonical URLs and metadataBase are set from NEXT_PUBLIC_SITE_URL.
- Open Graph and Twitter metadata are configured globally in the root layout.
- JSON-LD (WebApplication) is embedded in the layout for rich results eligibility.

How to customize
- Set NEXT_PUBLIC_SITE_URL to your production origin (https://example.com) before building.
- Update the description, keywords, and JSON-LD fields in src/app/layout.tsx.
- Add route-level generateMetadata exports on dynamic pages to set per-page titles and canonical URLs.
- Add an OG image generator at src/app/og/route.ts if desired (next/og) and reference it via openGraph.images.

Validation checklist
- Use Google Rich Results Test and Open Graph Debugger to validate metadata.
- Verify Lighthouse SEO score ≥ 90 on mobile and desktop.
- Ensure all links are crawlable (no orphan routes), and sitemap includes important pages.