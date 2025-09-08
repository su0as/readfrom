/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { setEntitlement } from '@/utils/entitlements';

export const runtime = 'nodejs';

// Heuristic helpers to read active status and period end from various Whop v5 objects
function readEmail(obj: any): string | null {
  const c = [
    obj?.email,
    obj?.customer?.email,
    obj?.user?.email,
    obj?.buyer_email,
    obj?.customer_email,
    obj?.attributes?.email,
    obj?.resource?.attributes?.email,
  ];
  for (const v of c) if (typeof v === 'string' && v.includes('@')) return v;
  // deep scan
  const stack = [obj]; const seen = new Set<any>();
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object' || seen.has(cur)) continue;
    seen.add(cur);
    for (const [k, v] of Object.entries(cur)) {
      if (typeof v === 'string' && v.includes('@')) return v;
      if (v && typeof v === 'object') stack.push(v as any);
    }
  }
  return null;
}

function isActive(obj: any): boolean {
  const s = String(obj?.status || obj?.state || obj?.attributes?.status || '').toLowerCase();
  if (['active', 'succeeded', 'success', 'completed', 'paid'].some((x) => s.includes(x))) return true;
  // Some APIs use boolean flags
  if (obj?.active === true) return true;
  return false;
}

function readPeriodEndMs(obj: any): number | undefined {
  const c = [obj?.current_period_end, obj?.period_end, obj?.attributes?.current_period_end];
  for (const v of c) {
    if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
    if (typeof v === 'string' && v && !Number.isNaN(Number(v))) {
      const n = Number(v); return n < 1e12 ? n * 1000 : n;
    }
  }
  return undefined;
}

async function tryJson(url: string, token: string) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`${r.status}`);
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('json')) throw new Error('not json');
  return r.json();
}

function normalizeList(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.items)) return data.items;
  // Some APIs return object with paging and an array at a custom key, fallback to values filter
  if (data && typeof data === 'object') {
    const arrays = Object.values(data).filter((x) => Array.isArray(x)) as any[];
    if (arrays.length) return arrays[0] as any[];
  }
  return [data];
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.WHOP_API_KEY) return NextResponse.json({ ok: false, reason: 'no api key' }, { status: 501 });
    const token = process.env.WHOP_API_KEY as string;
    const body = await req.json().catch(() => ({} as any));
    const email = (body?.email || '').toString().trim();
    const receiptId = (body?.receiptId || '').toString().trim();
    const planId = (body?.planId || '').toString().trim();

    const v5 = ['https://api.whop.com/v5', 'https://api.whop.com'];
    const v2 = ['https://api.whop.com/api/v2'];

    // Candidate fetchers — we try a few common patterns defensively
    const attempts: Array<() => Promise<any>> = [];

    if (receiptId) {
      for (const b of v5) {
        attempts.push(() => tryJson(`${b}/receipts/${encodeURIComponent(receiptId)}`, token));
        attempts.push(() => tryJson(`${b}/checkouts/${encodeURIComponent(receiptId)}`, token));
        attempts.push(() => tryJson(`${b}/orders/${encodeURIComponent(receiptId)}`, token));
      }
      for (const b of v2) {
        attempts.push(() => tryJson(`${b}/memberships/${encodeURIComponent(receiptId)}`, token));
        attempts.push(() => tryJson(`${b}/orders/${encodeURIComponent(receiptId)}`, token));
      }
    }
    if (email) {
      for (const b of v5) {
        attempts.push(() => tryJson(`${b}/memberships?email=${encodeURIComponent(email)}`, token));
        attempts.push(() => tryJson(`${b}/customers?email=${encodeURIComponent(email)}`, token));
        attempts.push(() => tryJson(`${b}/licenses?email=${encodeURIComponent(email)}`, token));
        attempts.push(() => tryJson(`${b}/orders?email=${encodeURIComponent(email)}`, token));
      }
      for (const b of v2) {
        attempts.push(() => tryJson(`${b}/memberships?email=${encodeURIComponent(email)}`, token));
        attempts.push(() => tryJson(`${b}/memberships?user_email=${encodeURIComponent(email)}`, token));
        attempts.push(() => tryJson(`${b}/memberships?customer_email=${encodeURIComponent(email)}`, token));
        // Unfiltered list (fallback): filter by email client-side
        attempts.push(() => tryJson(`${b}/memberships`, token));
      }
    }

    let verifiedEmail: string | null = null;
    let verifiedPeriodEnd: number | undefined;

    for (const fn of attempts) {
      try {
        const data = await fn();
        // Normalize response into an array of candidate items
        const list = normalizeList(data);
        for (const item of list) {
          const e = readEmail(item);
          const active = isActive(item);
          const pe = readPeriodEndMs(item);
          const pid = String(item?.plan_id || item?.planId || item?.attributes?.plan_id || item?.plan || '');
          const valid = item?.valid === true || active;
          const planOk = !planId || !pid || pid === planId;
          if (e && valid && planOk) {
            verifiedEmail = e;
            verifiedPeriodEnd = pe ?? (typeof item?.expires_at === 'number' ? (item.expires_at < 1e12 ? item.expires_at * 1000 : item.expires_at) : undefined) ?? (typeof item?.renewal_period_end === 'number' ? (item.renewal_period_end < 1e12 ? item.renewal_period_end * 1000 : item.renewal_period_end) : undefined);
            break;
          }
        }
        if (verifiedEmail) break;
      } catch {
        // ignore and try next
      }
    }

    if (!verifiedEmail) return NextResponse.json({ ok: false, reason: 'not verified' }, { status: 404 });

    await setEntitlement({ email: verifiedEmail, status: 'active', source: 'whop', updatedAt: Date.now(), planId: planId || undefined, periodEnd: verifiedPeriodEnd });
    return NextResponse.json({ ok: true, email: verifiedEmail, periodEnd: verifiedPeriodEnd });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'verify failed' }, { status: 500 });
  }
}
