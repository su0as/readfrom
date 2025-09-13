import type { NextRequest } from "next/server";

export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser or same-origin navigation
  try {
    const o = new URL(origin);
    return o.host === req.nextUrl.host;
  } catch {
    return false;
  }
}

export function getSiteOrigin(req?: NextRequest): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (req) return `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  return "";
}