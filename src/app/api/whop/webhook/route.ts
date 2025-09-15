/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { setEntitlement } from "@/utils/entitlements";
import { storeGet, storeSet } from "@/utils/blobStore";
import { createHmac, timingSafeEqual, createHash } from "node:crypto";

export const runtime = "nodejs";

// Webhook signature verification (opt-in)
function verifySignature(
  raw: Uint8Array,
  header: string | null,
  secret: string,
): boolean {
  if (!header) return false;
  // Accept either a plain hex signature or prefixed value like "sha256=..."
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const got = header.replace(/^sha256=/i, "").trim();
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(got, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Idempotency key derived from raw body
function bodyDigest(raw: Uint8Array): string {
  return createHash("sha256").update(raw).digest("hex");
}

function get(obj: any, path: string[]): any {
  try {
    return path.reduce(
      (acc, key) => (acc && key in acc ? acc[key] : undefined),
      obj,
    );
  } catch {
    return undefined;
  }
}

function extractEmail(payload: any): string | null {
  // 1) Fast-path candidates at common locations
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
    get(payload, ["resource", "attributes", "email"]),
    get(payload, ["resource", "email"]),
    get(payload, ["attributes", "email"]),
  ];
  const found = candidates.find(
    (v) => typeof v === "string" && v.includes("@"),
  );
  if (found) return found as string;
  // 2) Deep scan: prefer keys that include 'email', else any string containing '@'
  const seen = new Set<any>();
  const prefer: string[] = [];
  const fallback: string[] = [];
  const stack: any[] = [payload];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    for (const [k, v] of Object.entries(cur)) {
      if (typeof v === "string") {
        if (v.includes("@")) {
          if (k.toLowerCase().includes("email")) prefer.push(v);
          else fallback.push(v);
        }
      } else if (v && typeof v === "object") {
        stack.push(v);
      }
    }
  }
  if (prefer.length) return prefer[0];
  if (fallback.length) return fallback[0];
  return null;
}

function eventType(payload: any): string {
  return (
    payload?.type ||
    payload?.event ||
    get(payload, ["data", "type"]) ||
    get(payload, ["event", "type"]) ||
    ""
  )
    .toString()
    .toLowerCase();
}

function isActivateType(t: string): boolean {
  return (
    t === "app_payment_succeeded" ||
    // Common patterns
    (t.includes("payment") &&
      (t.includes("succeeded") ||
        t.includes("success") ||
        t.includes("completed"))) ||
    (t.includes("purchase") &&
      (t.includes("completed") || t.includes("succeeded"))) ||
    (t.includes("subscription") &&
      (t.includes("created") ||
        t.includes("activated") ||
        t.includes("updated") ||
        t.includes("active"))) ||
    (t.includes("license") &&
      (t.includes("created") || t.includes("activated")))
  );
}

function isCancelType(t: string): boolean {
  return (
    t.includes("cancel") ||
    t.includes("expired") ||
    t.includes("past_due") ||
    t.includes("payment_failed") ||
    t.includes("refund")
  );
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
    const rawAb = await req.arrayBuffer();
    const raw = new Uint8Array(rawAb);

    // Optional signature verification
    const secret = process.env.WHOP_WEBHOOK_SECRET;
    if (secret) {
      const sig =
        req.headers.get("x-whop-signature") ||
        req.headers.get("whop-signature");
      if (!verifySignature(raw, sig, secret)) {
        return NextResponse.json(
          { ok: false, reason: "invalid signature" },
          { status: 401 },
        );
      }
    }

    // Idempotency: ignore duplicates of identical payloads for 24h
    const digest = bodyDigest(raw);
    const seenKey = `rf:webhook:seen:${digest}`;
    const seen = await storeGet(seenKey);
    if (seen) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    // Parse body (JSON preferred, fallback to form-encoded)
    let body: any = null;
    try {
      body = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      try {
        const txt = new TextDecoder().decode(raw);
        const p = new URLSearchParams(txt);
        const obj: Record<string, any> = {};
        p.forEach((v, k) => {
          obj[k] = v;
        });
        body = obj;
      } catch {
        body = null;
      }
    }
    if (!body)
      return NextResponse.json(
        { ok: false, reason: "no body" },
        { status: 400 },
      );
    const email = extractEmail(body);
    // Header fallbacks for event type
    const headerType = (
      req.headers.get("x-whop-event") ||
      req.headers.get("x-whop-type") ||
      req.headers.get("x-event-type") ||
      req.headers.get("event-type") ||
      ""
    ).toLowerCase();
    const t = (eventType(body) || headerType).toLowerCase();
    if (!email)
      return NextResponse.json(
        { ok: false, reason: "no email" },
        { status: 400 },
      );

    const now = Date.now();
    if (process.env.DEBUG_WHOP === "1") {
      try {
        console.log("[WHOP] raw:", JSON.stringify(body).slice(0, 2000));
      } catch {}
      console.log(
        "[WHOP] event:",
        t,
        "email:",
        email,
        "plan:",
        body?.plan_id ||
          get(body, ["data", "plan_id"]) ||
          get(body, ["plan", "id"]),
      );
    }
    if (isActivateType(t)) {
      await setEntitlement({
        email,
        status: "active",
        source: "whop",
        updatedAt: now,
        productId:
          body?.product_id ??
          get(body, ["data", "product_id"]) ??
          get(body, ["product", "id"])?.toString(),
        planId:
          body?.plan_id ??
          get(body, ["data", "plan_id"]) ??
          get(body, ["plan", "id"])?.toString(),
        periodEnd: extractPeriodEndMs(body),
      });
      // Mark seen on success (24h)
      await storeSet(seenKey, "1", 24 * 3600);
      return NextResponse.json({ ok: true });
    }

    if (isCancelType(t)) {
      await setEntitlement({
        email,
        status: "canceled",
        source: "whop",
        updatedAt: now,
        productId:
          body?.product_id ??
          get(body, ["data", "product_id"]) ??
          get(body, ["product", "id"])?.toString(),
        planId:
          body?.plan_id ??
          get(body, ["data", "plan_id"]) ??
          get(body, ["plan", "id"])?.toString(),
      });
      await storeSet(seenKey, "1", 24 * 3600);
      return NextResponse.json({ ok: true });
    }

    // Ignore unknown events
    return NextResponse.json({ ok: true, ignored: true, event: t });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "webhook failed" },
      { status: 500 },
    );
  }
}

// Optional: respond to GET with a simple OK for manual checks (webhook providers will use POST)
export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Whop webhook endpoint ready",
  });
}
