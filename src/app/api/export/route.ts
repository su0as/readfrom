/* Create an export spec for Pro users and return embed/download URLs. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getEntitlement } from '@/utils/entitlements';
import { storeSet } from '@/utils/blobStore';

export const runtime = 'nodejs';

function randId(len = 22) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function planTierFromPlanId(planId?: string | null): 'basic' | 'pro' | null {
  const env = (name: string) => (process.env as Record<string, string | undefined>)[name];
  // Fallback links (must mirror utils/checkout.ts FALLBACK_LINKS)
  const FALLBACK_LINKS: Record<string, string> = {
    BASIC_MONTHLY: 'https://whop.com/checkout/plan_WuQ9oNNUPtoqW?d2c=true',
    BASIC_YEARLY: 'https://whop.com/checkout/plan_UREUrsMIXAO1N?d2c=true',
    PRO_MONTHLY: 'https://whop.com/checkout/plan_o9jbTY2jmGRo8?d2c=true',
    PRO_YEARLY: 'https://whop.com/checkout/plan_DWncFUzXGw4Cc?d2c=true',
  };
  const candidates: Array<[string | undefined, 'basic' | 'pro']> = [
    [env('NEXT_PUBLIC_WHOP_CHECKOUT_URL_BASIC_MONTHLY') || FALLBACK_LINKS.BASIC_MONTHLY, 'basic'],
    [env('NEXT_PUBLIC_WHOP_CHECKOUT_URL_BASIC_YEARLY') || FALLBACK_LINKS.BASIC_YEARLY, 'basic'],
    [env('NEXT_PUBLIC_WHOP_CHECKOUT_URL_PRO_MONTHLY') || FALLBACK_LINKS.PRO_MONTHLY, 'pro'],
    [env('NEXT_PUBLIC_WHOP_CHECKOUT_URL_PRO_YEARLY') || FALLBACK_LINKS.PRO_YEARLY, 'pro'],
  ];
  function planIdFromUrl(u?: string) {
    if (!u) return null;
    try {
      const url = new URL(u);
      const m = url.pathname.match(/\/plan_[A-Za-z0-9]+/);
      return m ? m[0].slice(1) : null;
    } catch {
      const m = u.match(/\/plan_[A-Za-z0-9]+/);
      return m ? m[0].slice(1) : null;
    }
  }
  for (const [u, tier] of candidates) {
    const pid = planIdFromUrl(u);
    if (pid && pid === planId) return tier;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    // Fully tolerant body parsing: read raw text first, then interpret based on Content-Type
    const ct = (req.headers.get('content-type') || '').toLowerCase();
    let body: any = {};
    let raw = '';
    try {
      raw = await req.text();
    } catch {
      raw = '';
    }

    if (raw) {
      const tryParseJson = () => {
        try {
          const parsed = JSON.parse(raw);
          // If JSON is a primitive (e.g., a string), ignore — we expect an object
          return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
          return null;
        }
      };

      if (ct.includes('application/json') || ct.includes('+json')) {
        body = tryParseJson() ?? {};
      } else if (ct.includes('application/x-www-form-urlencoded')) {
        try { const params = new URLSearchParams(raw); body = Object.fromEntries(params.entries()); } catch { body = {}; }
      } else {
        // Heuristics: attempt JSON first, then URL-encoded; else treat as empty
        const maybe = tryParseJson();
        if (maybe) body = maybe; else {
          try { const params = new URLSearchParams(raw); body = Object.fromEntries(params.entries()); } catch { body = {}; }
        }
      }
    }

    const text = String((body as any)?.text || '').trim();
    const voice = String((body as any)?.voice || '').trim();
    const speed = Number((body as any)?.speed || 1);
    const container = (String((body as any)?.container || 'mp3') === 'ogg' ? 'ogg' : 'mp3') as 'mp3' | 'ogg';
    if (!text || !voice || !speed) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    const email = String((body as any)?.email || req.cookies.get('rf_email')?.value || '');
    if (!email) return NextResponse.json({ error: 'No email' }, { status: 401 });
    let ent = await getEntitlement(email);
    if (!ent || ent.status !== 'active') return NextResponse.json({ error: 'Not entitled' }, { status: 403 });
    let tier = planTierFromPlanId(ent.planId);
    if (tier !== 'pro') {
      // Try to refresh entitlement via server-side verify, then re-check
      try {
        const origin = req.headers.get('x-forwarded-host')
          ? `${req.headers.get('x-forwarded-proto') || 'https'}://${req.headers.get('x-forwarded-host')}`
          : `${req.nextUrl.protocol}//${req.nextUrl.host}`;
        await fetch(`${origin}/api/whop/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
        ent = await getEntitlement(email);
        tier = planTierFromPlanId(ent?.planId);
      } catch {}
    }
    if (tier !== 'pro') return NextResponse.json({ error: 'Pro required' }, { status: 403 });

    const id = randId();
    const spec = { text, voice, speed, container };
    await storeSet(`rf:spec:${id}`, JSON.stringify(spec), 7 * 24 * 3600);

    const origin = req.headers.get('x-forwarded-host')
      ? `${req.headers.get('x-forwarded-proto') || 'https'}://${req.headers.get('x-forwarded-host')}`
      : `${req.nextUrl.protocol}//${req.nextUrl.host}`;
    const embedUrl = `${origin}/embed/${id}`;
    const downloadUrl = `${origin}/api/export/download?id=${encodeURIComponent(id)}&container=${container}`;
    const embedCode = `<iframe src="${embedUrl}" width="100%" height="80" frameborder="0" allow="autoplay"></iframe>`;

    return NextResponse.json({ id, embedUrl, downloadUrl, embedCode });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Export failed' }, { status: 500 });
  }
}

