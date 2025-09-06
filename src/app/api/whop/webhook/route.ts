/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { setEntitlement } from "@/utils/entitlements";

export const runtime = "nodejs";

// NOTE: This is a scaffold. We'll wire real signature verification once you provide WHOP_WEBHOOK_SECRET
// and confirm header/algorithm. Until then, it accepts JSON (or form-encoded fallback) and extracts an email.

function get(obj: any, path: string[]): any {
  try {
    return path.reduce((acc, key) => (acc && key in acc ? acc[key] : undefined), obj);
  } catch {
    return undefined;
  }
}

function extractEmail(payload: any): string | null {
  const candidates = [
    payload?.customer?.email,
    payload?.user?.email,
    payload?.purchaser?.email,
    payload?.buyer_email,
    payload?.customer_email,
    payload?.emailAddress,
    payload?.email,
    get(payload, ["data", "email"]),
    get(payload, ["data", "customer", "email"]),
    get(payload, ["data", "user", "email"]),
    get(payload, ["data", "purchaser", "email"]),
    get(payload, ["data", "attributes", "email"]),
    get(payload, ["order", "customer", "email"]),
    get(payload, ["event", "data", "customer_email"]),
  ];
  const found = candidates.find((v) => typeof v === "string" && v.includes("@"));
  return (found as string) || null;
}

function eventType(payload: any): string {
  return (payload?.type || payload?.event || get(payload, ["data", "type"]) || get(payload, ["event", "type"]) || "").toString().toLowerCase();
}

function isActivateEvent(payload: any): boolean {
  const t = eventType(payload);
  return (
    t === "app_payment_succeeded" ||
    (t.includes("purchase") && (t.includes("completed") || t.includes("succeeded"))) ||
    (t.includes("subscription") && (t.includes("created") || t.includes("activated") || t.includes("updated") || t.includes("active"))) ||
    (t.includes("license") && (t.includes("created") || t.includes("activated")))
  );
}

function isCancelEvent(payload: any): boolean {
  const t = eventType(payload);
  return t.includes("cancel") || t.includes("expired") || t.includes("past_due") || t.includes("payment_failed");
}

function extractPeriodEndMs(payload: any): number | undefined {
  const candidates = [
    payload?.period_end,
    get(payload, ["data", "period_end"]),
    get(payload, ["data", "current_period_end"]),
    get(payload, ["subscription", "current_period_end"]),
  ];
  for (const v of candidates) {
    if (typeof v === "number") {
      const n = v < 1e12 ? v * 1000 : v; // normalize seconds -> ms
      return n;
    }
    if (typeof v === "string" && v && !Number.isNaN(Number(v))) {
      const n = Number(v);
      const nms = n < 1e12 ? n * 1000 : n;
      return nms;
    }
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  try {
    // TODO: verify signature header if WHOP_WEBHOOK_SECRET is set
    let body: any = null;
    try {
      body = await req.json();
    } catch {
      // Fallback: attempt to parse form-encoded or raw text JSON
      try {
        const txt = await req.text();
        try { body = JSON.parse(txt); } catch {
          const p = new URLSearchParams(txt);
          const obj: Record<string, any> = {};
          p.forEach((v, k) => { obj[k] = v; });
          body = obj;
        }
      } catch {}
    }
    if (!body) return NextResponse.json({ ok: false, reason: "no body" }, { status: 400 });
    const email = extractEmail(body);
    if (!email) return NextResponse.json({ ok: false, reason: "no email" }, { status: 400 });

    const now = Date.now();
    if (process.env.DEBUG_WHOP === "1") {
      console.log("[WHOP] event:", eventType(body), "email:", email, "plan:", body?.plan_id || get(body,["data","plan_id"]) || get(body,["plan","id"]));
    }
    if (isActivateEvent(body)) {
      await setEntitlement({
        email,
        status: "active",
        source: "whop",
        updatedAt: now,
        productId: body?.product_id ?? get(body, ["data", "product_id"]) ?? get(body, ["product", "id"])?.toString(),
        planId: body?.plan_id ?? get(body, ["data", "plan_id"]) ?? get(body, ["plan", "id"])?.toString(),
        periodEnd: extractPeriodEndMs(body),
      });
      return NextResponse.json({ ok: true });
    }

    if (isCancelEvent(body)) {
      await setEntitlement({
        email,
        status: "canceled",
        source: "whop",
        updatedAt: now,
        productId: body?.product_id ?? get(body, ["data", "product_id"]) ?? get(body, ["product", "id"])?.toString(),
        planId: body?.plan_id ?? get(body, ["data", "plan_id"]) ?? get(body, ["plan", "id"])?.toString(),
      });
      return NextResponse.json({ ok: true });
    }

    // Ignore unknown events
    return NextResponse.json({ ok: true, ignored: true, event: eventType(body) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "webhook failed" }, { status: 500 });
  }
}

// Optional: respond to GET with a simple OK for manual checks (webhook providers will use POST)
export async function GET() {
  return NextResponse.json({ ok: true, message: "Whop webhook endpoint ready" });
}
