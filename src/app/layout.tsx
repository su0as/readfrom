import type { Metadata, Viewport } from "next";
import { Spectral } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Link from "next/link";

const spectral = Spectral({
  variable: "--font-spectral",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const site = (
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
).replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: {
    default: "ReadFrom",
    template: "%s • ReadFrom",
  },
  description:
    "ReadFrom – focused text-to-speech reader with word-level highlighting.",
  keywords: ["text to speech", "tts", "reader", "audioreader", "accessibility"],
  authors: [{ name: "ReadFrom" }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "ReadFrom",
    title: "ReadFrom",
    description:
      "High-quality text-to-speech reader with word-level highlighting.",
  },
  twitter: {
    card: "summary_large_image",
    title: "ReadFrom",
    description:
      "High-quality text-to-speech reader with word-level highlighting.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#111111",
};

// Force dynamic rendering for the root segment to avoid prerendering the client-only reader page.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "ReadFrom",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    url: site,
    description:
      "High-quality text-to-speech reader with word-level highlighting.",
    offers: { "@type": "Offer", price: "9.99", priceCurrency: "USD" },
  } as const;
  return (
    <html lang="en" className="theme-white" suppressHydrationWarning>
      <body
        className={`${spectral.variable} antialiased`}
        suppressHydrationWarning
      >
        <header className="app-header" style={{ padding: "12px 16px" }}>
          <Link
            href="/"
            className="logo"
            aria-label="readto home"
            style={{ textDecoration: "none" }}
          >
            <span
              className="read"
              style={{
                textTransform: "lowercase",
                fontWeight: 400,
                fontFamily: "var(--font-spectral)",
                fontSize: 20,
              }}
            >
              read
            </span>
            <span
              className="to"
              style={{
                textTransform: "lowercase",
                fontWeight: 400,
                fontFamily: "var(--font-spectral)",
                fontSize: 20,
                marginLeft: 2,
              }}
            >
              to
            </span>
          </Link>
          <nav style={{ marginLeft: "auto" }}>
            <Link href="/pricing" className="btn" style={{ marginLeft: 8 }}>
              Pricing
            </Link>
          </nav>
        </header>
        {children}
        <Analytics />
        <SpeedInsights />
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
