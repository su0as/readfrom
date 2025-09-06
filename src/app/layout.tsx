import type { Metadata } from "next";
import { Spectral } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const spectral = Spectral({
  variable: "--font-spectral",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ReadFrom",
  description: "ReadFrom: Focused text-to-speech reader with word-level highlighting.",
};

// Force dynamic rendering for the root segment to avoid prerendering the client-only reader page.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="theme-white" suppressHydrationWarning>
      <body className={`${spectral.variable} antialiased`} suppressHydrationWarning>
        <header className="app-header" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <a href="/" className="logo" aria-label="readto home" style={{ textDecoration: 'none' }}>
            <span className="read" style={{ textTransform:'lowercase', fontWeight:700, fontFamily:'var(--font-spectral)', fontSize:20 }}>read</span>
            <span className="to" style={{ textTransform:'lowercase', fontWeight:700, fontFamily:'var(--font-spectral)', fontSize:20, marginLeft:2 }}>to</span>
          </a>
        </header>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
