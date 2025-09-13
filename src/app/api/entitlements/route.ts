/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getEntitlement, isEntitled } from "@/utils/entitlements";
import { limitByIP } from "@/utils/rateLimit";
import { isSameOrigin } from "@/utils/origin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    // Same-origin only for browser calls
    if (!isSameOrigin(req)) {
      return NextResponse.json({ error: "CORS forbidden" }, { status: 403 });
    }

    const { success, remaining, reset } = await limitByIP(req, 120, 60);
    if (!success) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: { "X-RateLimit-Limit": "120", "X-RateLimit-Remaining": String(remaining), "X-RateLimit-Reset": String(reset) } }
      );
    }

    const { searchParams } = new URL(req.url);
    const emailQ = searchParams.get("email");
    const email = emailQ || req.cookies.get("rf_email")?.value || null;
    if (!email) return NextResponse.json({ entitled: false });
    const entitled = await isEntitled(email);
    const ent = await getEntitlement(email);
    if (process.env.DEBUG_WHOP === "1") {
      console.log("[ENTL] lookup", email, { entitled, ent });
    }
    return NextResponse.json({ email, entitled, entitlement: ent || undefined });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
