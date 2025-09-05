/* Client-only currency helpers for showing local prices with USD as base.
   - Detects user currency from navigator.language
   - Fetches USD FX rates from exchangerate.host and caches for 24h in localStorage
*/
"use client";

export type UsdRates = { rates: Record<string, number>; fetchedAt: number };

const FX_KEY = "rf_fx_usd_v1";
const FX_TTL = 24 * 60 * 60 * 1000; // 24h

// Minimal mapping from locale to currency code; fallback to USD.
const LOCALE_TO_CURRENCY: Array<[RegExp, string]> = [
  [/en-US/i, "USD"],
  [/en-GB|uk|ie|cy|mt/i, "GBP"],
  [/en-CA|fr-CA/i, "CAD"],
  [/en-AU/i, "AUD"],
  [/en-IN|hi-IN/i, "INR"],
  [/de-DE|fr-FR|es-ES|it-IT|nl-NL|pt-PT|fi-FI|el-GR|sk-SK|sl-SI|et-EE|lv-LV|lt-LT|ga-IE/i, "EUR"],
  [/es-MX/i, "MXN"],
  [/pt-BR/i, "BRL"],
  [/ja-JP/i, "JPY"],
  [/ko-KR/i, "KRW"],
  [/zh-CN/i, "CNY"],
  [/zh-TW/i, "TWD"],
  [/ru-RU/i, "RUB"],
  [/sv-SE/i, "SEK"],
  [/no-NO/i, "NOK"],
  [/da-DK/i, "DKK"],
  [/pl-PL/i, "PLN"],
  [/cs-CZ/i, "CZK"],
  [/hu-HU/i, "HUF"],
  [/tr-TR/i, "TRY"],
  [/ar-SA/i, "SAR"],
  [/he-IL/i, "ILS"],
  [/th-TH/i, "THB"],
  [/id-ID/i, "IDR"],
  [/vi-VN/i, "VND"],
  [/fil-PH|tl-PH/i, "PHP"],
];

export function detectCurrencyCode(): string {
  if (typeof window === "undefined") return "USD";
  const lang = navigator.language || "en-US";
  for (const [re, code] of LOCALE_TO_CURRENCY) {
    if (re.test(lang)) return code;
  }
  return "USD";
}

export async function getUsdRates(): Promise<UsdRates> {
  if (typeof window === "undefined") return { rates: {}, fetchedAt: 0 };
  try {
    const raw = localStorage.getItem(FX_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as UsdRates;
      if (parsed && parsed.fetchedAt && Date.now() - parsed.fetchedAt < FX_TTL) {
        return parsed;
      }
    }
  } catch {}

  try {
    const res = await fetch("https://api.exchangerate.host/latest?base=USD", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { rates?: Record<string, number> };
    const bundle: UsdRates = { rates: data.rates || {}, fetchedAt: Date.now() };
    try { localStorage.setItem(FX_KEY, JSON.stringify(bundle)); } catch {}
    return bundle;
  } catch {
    return { rates: {}, fetchedAt: 0 };
  }
}

export async function convertUsd(amountUsd: number, targetCode?: string): Promise<{ localAmount: number; localCode: string; hasRate: boolean }>{
  const code = targetCode || detectCurrencyCode();
  if (code === "USD") return { localAmount: amountUsd, localCode: "USD", hasRate: true };
  const { rates } = await getUsdRates();
  const rate = rates[code];
  if (!rate || !isFinite(rate)) {
    return { localAmount: amountUsd, localCode: code, hasRate: false };
  }
  return { localAmount: amountUsd * rate, localCode: code, hasRate: true };
}

export function formatCurrency(amount: number, code: string, locale?: string): string {
  try {
    return new Intl.NumberFormat(locale || (typeof navigator !== "undefined" ? navigator.language : "en-US"), {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Fallback naive formatting
    const sym = code === "USD" ? "$" : "";
    return `${sym}${amount.toFixed(2)} ${code}`.trim();
  }
}

export async function formatUsdAndLocal(amountUsd: number, targetCode?: string): Promise<{ local: string; usd: string; localCode: string }>{
  const { localAmount, localCode } = await convertUsd(amountUsd, targetCode);
  const local = formatCurrency(localAmount, localCode);
  const usd = formatCurrency(amountUsd, "USD");
  return { local, usd, localCode };
}

// Optional helper hook for components
import { useEffect, useMemo, useState } from "react";
export function useUsdToLocal() {
  const [code] = useState<string>(() => (typeof window !== "undefined" ? detectCurrencyCode() : "USD"));
  const [rates, setRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const fx = await getUsdRates();
        if (!mounted) return;
        setRates(fx.rates || {});
      } catch (e: unknown) {
        if (!mounted) return; setError(e instanceof Error ? e.message : "fx failed");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const format = useMemo(() => (amountUsd: number, forceCode?: string) => {
    const c = forceCode || code;
    if (c === "USD") return { primary: formatCurrency(amountUsd, "USD"), anchor: "" };
    const rate = rates[c];
    if (!rate || !isFinite(rate)) return { primary: formatCurrency(amountUsd, "USD"), anchor: "" };
    const local = formatCurrency(amountUsd * rate, c);
    const anchor = formatCurrency(amountUsd, "USD");
    return { primary: local, anchor };
  }, [code, rates]);

  return { code, loading, error, format } as const;
}

