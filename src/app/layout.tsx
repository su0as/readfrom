import type { Metadata, Viewport } from "next";
import { Spectral, Inter } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const spectral = Spectral({
  variable: "--font-spectral",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-ui",
  subsets: ["latin"],
  display: "swap",
});

const site = (
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
).replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: {
    default: "ReadTo — Turn Any Text Into a Natural Audio Experience",
    template: "%s • ReadTo",
  },
  description:
    "Paste any text, article, or ebook and listen with natural AI voices and word-by-word highlighting. Free preview, affordable plans.",
  keywords: [
    "text to speech",
    "tts",
    "reader",
    "audioreader",
    "accessibility",
    "article reader",
    "listen to articles",
  ],
  authors: [{ name: "ReadTo" }],
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "ReadTo",
    title: "ReadTo — Turn Any Text Into a Natural Audio Experience",
    description:
      "Paste any text, article, or ebook and listen with natural AI voices and word-by-word highlighting.",
  },
  twitter: {
    card: "summary_large_image",
    title: "ReadTo — Turn Any Text Into a Natural Audio Experience",
    description:
      "Paste any text, article, or ebook and listen with natural AI voices and word-by-word highlighting.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#111111",
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "ReadTo",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    url: site,
    description:
      "Paste any text, article, or ebook and listen with natural AI voices and word-by-word highlighting.",
    offers: {
      "@type": "AggregateOffer",
      lowPrice: "2.99",
      highPrice: "49.99",
      priceCurrency: "USD",
    },
  } as const;
  return (
    <html lang="en" className="theme-white" suppressHydrationWarning>
      <body
        className={`${spectral.variable} ${inter.variable} antialiased`}
        suppressHydrationWarning
      >
        {children}
        <Analytics />
        <SpeedInsights />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
