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
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
