/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { setEntitlement } from "@/utils/entitlements";

export const runtime = "nodejs";

// NOTE: This is a scaffold. We'll wire real signature verification once you provide WHOP_WEBHOOK_SECRET
// and confirm header/algorithm. Until then, it accepts JSON and extracts an email from common fields.

function extractEmail(payload: any): string | null {
  return (
    payload?.customer?.email ||
    payload?.user?.email ||
    payload?.purchaser?.email ||
    payload?.email ||
    null
  );
}

function isActivateEvent(payload: any): boolean {
  const t = (payload?.type || payload?.event || "").toString().toLowerCase();
  return (
    t.includes("purchase") && t.includes("completed") ||
    t.includes("subscription") && (t.includes("created") || t.includes("activated") || t.includes("updated")) ||
    t.includes("license") && (t.includes("created") || t.includes("activated"))
  );
}

function isCancelEvent(payload: any): boolean {
  const t = (payload?.type || payload?.event || "").toString().toLowerCase();
  return t.includes("cancel") || t.includes("expired") || t.includes("past_due");
}

export async function POST(req: NextRequest) {
  try {
    // TODO: verify signature header if WHOP_WEBHOOK_SECRET is set
    const body = await req.json();
    const email = extractEmail(body);
    if (!email) return NextResponse.json({ ok: false, reason: "no email" }, { status: 400 });

    const now = Date.now();
    if (isActivateEvent(body)) {
      await setEntitlement({ email, status: "active", source: "whop", updatedAt: now, productId: body?.product_id, planId: body?.plan_id, periodEnd: body?.period_end ? Number(body.period_end) : undefined });
      return NextResponse.json({ ok: true });
    }

    if (isCancelEvent(body)) {
      await setEntitlement({ email, status: "canceled", source: "whop", updatedAt: now, productId: body?.product_id, planId: body?.plan_id });
      return NextResponse.json({ ok: true });
    }

    // Ignore unknown events
    return NextResponse.json({ ok: true, ignored: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "webhook failed" }, { status: 500 });
  }
}
