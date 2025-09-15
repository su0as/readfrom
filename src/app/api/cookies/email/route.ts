/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { limitByIP } from "@/utils/rateLimit";
import { isSameOrigin } from "@/utils/origin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    if (!isSameOrigin(req))
      return NextResponse.json({ ok: false }, { status: 403 });
    const { success } = await limitByIP(req, 20, 60);
    if (!success)
      return NextResponse.json(
        { ok: false, reason: "rate_limited" },
        { status: 429 },
      );

    const body = await req.json().catch(() => ({}) as any);
    const email = (body?.email || "").toString().trim();
    if (!/.+@.+\..+/.test(email))
      return NextResponse.json({ ok: false }, { status: 400 });

    const res = NextResponse.json({ ok: true });
    const oneYear = 365 * 24 * 3600;
    res.cookies.set("rf_email", encodeURIComponent(email), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: oneYear,
    });
    return res;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "failed" },
      { status: 500 },
    );
  }
}
