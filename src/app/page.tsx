/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

// Disable prerendering to avoid static generation errors during build.
// This page is fully client-driven and fetches/plays audio at runtime.
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VOICES } from "@/components/voices";
import PricingModal from "@/components/PricingModal";
import TopBar from "@/components/TopBar";
import PlaybackBar from "@/components/PlaybackBar";
import UpgradeBanner from "@/components/UpgradeBanner";
import Library from "@/components/Library";
import { useLibrary } from "@/hooks/useLibrary";
import { parseEpub } from "@/utils/epubParser";
import { planLabelFromId } from "@/utils/checkout";
import Walkthrough from "@/components/Walkthrough";

// Debug toggle: set window.DEBUG_FOCUS = true in console to enable verbose logs
const DEBUG_FOCUS: boolean =
  typeof window !== "undefined" && !!(window as any).DEBUG_FOCUS;
const dbg = (...args: any[]) => {
  if (DEBUG_FOCUS) console.log("[FOCUS]", ...args);
};

// Tokenizer consistent with the server
const TOKEN_RE = /([A-Za-z0-9][A-Za-z0-9''\-]*|\s+|[^\sA-Za-z0-9]+)/g;

type Token = { t: "word" | "sep"; v: string; wi?: number };

function tokenize(text: string) {
  const tokens: Token[] = [];
  let m: RegExpExecArray | null;
  let wi = 0;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    const v = m[0];
    const isWord = /[A-Za-z0-9]/.test(v[0]) && /\S/.test(v);
    if (isWord) tokens.push({ t: "word", v, wi: wi++ });
    else tokens.push({ t: "sep", v });
  }
  return { tokens, totalWords: wi };
}

function classNames(...xs: Array<string | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}

// Yield to the browser to allow a paint before continuing heavy work
const nextFrame = () =>
  new Promise<void>((resolve) => {
    if (typeof window === "undefined") return resolve();
    requestAnimationFrame(() => resolve());
  });

// Sample texts for empty state
const SAMPLES = [
  {
    label: "News",
    title: "The Art of Deep Work",
    text: `In a world of constant distraction, the ability to focus without interruption has become increasingly rare — and increasingly valuable. Cal Newport calls this "deep work": professional activity performed in a state of distraction-free concentration that pushes your cognitive capabilities to their limit.

These efforts create new value, improve your skill, and are hard to replicate. Deep work is becoming the killer skill of our age. The workers who can perform it will thrive; those who can't will struggle to keep up.`,
  },
  {
    label: "Science",
    title: "How Memory Consolidates During Sleep",
    text: `During sleep, the hippocampus replays memories formed during the day, transferring them to the neocortex for long-term storage. This process, called memory consolidation, happens primarily during slow-wave sleep and rapid eye movement sleep.

Researchers have found that getting adequate sleep after learning new material can improve recall by up to 40% compared to pulling an all-nighter. The brain essentially uses the quiet of sleep to organize and strengthen what it has learned.`,
  },
  {
    label: "Fiction",
    title: "The Last Lighthouse Keeper",
    text: `The storm had been building for three days when Elena finally saw the light go out. Forty years she had tended the Porthaven lighthouse, through gales that rattled the glass and fog so thick you could taste it. But she had never seen the beam fail.

She pulled on her oilskin and stepped into the wind. The rain came sideways, the kind that found every gap in your clothing. The lighthouse door was unlocked — it was always unlocked — and inside, the smell of salt and machine oil wrapped around her like a memory.`,
  },
];

export default function Home() {
  // UI state (SSR-safe defaults; hydrate from localStorage after mount)
  const [theme, setTheme] = useState<string>("white");
  const [voice, setVoice] = useState<string>(VOICES[0].id);
  const [speed, setSpeed] = useState<number>(1.0);
  const [align, setAlign] = useState<"left" | "center" | "justify">("center");
  const [fontSize, setFontSize] = useState<"sm" | "md" | "lg">("md");
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [mode, setMode] = useState<"edit" | "read">("edit");

  // Editor and reader
  const editorRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<HTMLDivElement>(null);

  const PLACEHOLDER = "Paste any text, article, or URL to start listening…";
  const [text, setText] = useState<string>(PLACEHOLDER);
  const [isPlaceholder, setIsPlaceholder] = useState<boolean>(true);
  const [tokens, setTokens] = useState<Token[]>([]);

  // Playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [segments, setSegments] = useState<
    { url: string; durationMs: number; startWordIndex: number }[]
  >([]);
  const [segmentOffsets, setSegmentOffsets] = useState<number[]>([]);
  const [timepoints, setTimepoints] = useState<
    { wordIndex: number; tMs: number }[]
  >([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentSegment = useRef(0);
  const timepointsRef = useRef<{ wordIndex: number; tMs: number }[]>([]);
  const activeRef = useRef<number>(-1);
  const containerRef = useRef<"ogg" | "mp3">("ogg");
  const fallbackTriedRef = useRef<boolean>(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  // Refs for immediate access without waiting for React state flush
  const segmentsRef = useRef<
    { url: string; durationMs: number; startWordIndex: number }[]
  >([]);
  const segStartMsRef = useRef<number[]>([]); // from timing map (may be rough)
  const segmentRangesRef = useRef<
    { startIdx: number; endIdx: number; startWi: number }[]
  >([]);
  const tpByWiRef = useRef<Map<number, number>>(new Map());
  // New refs for duration-based sync (authoritative for highlight/seek)
  const durOffsetsRef = useRef<number[]>([]); // cumulative sum of segment durations (ms)
  const measuredDurMsRef = useRef<number[]>([]); // measured durations via <audio>
  const wordsPerSegRef = useRef<number[]>([]); // number of words in each segment
  const totalWordsRef = useRef<number>(0);
  const completedRef = useRef<boolean>(false);

  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [loading, setLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [readAnim, setReadAnim] = useState<boolean>(false);

  // Billing/entitlement
  const [entitled, setEntitled] = useState<boolean>(false);
  const entitledRef = useRef<boolean>(false);
  useEffect(() => {
    entitledRef.current = entitled;
  }, [entitled]);
  const [email, setEmail] = useState<string>("");
  // Entitlement details (plan/expiry) for UI
  const [entInfo, setEntInfo] = useState<{
    planId?: string;
    periodEnd?: number;
  } | null>(null);
  // Pricing modal state
  const [showPricing, setShowPricing] = useState<boolean>(false);
  const [modalContext] = useState<
    "play" | "preview-expired" | "sidebar" | "generic"
  >("generic");
  const PREVIEW_SECONDS = Math.max(
    5,
    Math.min(600, Number(process.env.NEXT_PUBLIC_PREVIEW_SECONDS || "60")),
  );
  const previewTimerRef = useRef<number | null>(null);

  // Library (reading history)
  const { entries: libraryEntries, addEntry: addLibraryEntry, removeEntry: removeLibraryEntry } = useLibrary();

  // New state
  const [urlInput, setUrlInput] = useState<string>("");
  const [fetchingUrl, setFetchingUrl] = useState<boolean>(false);
  const [showBanner, setShowBanner] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Playback time display state
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [totalDurationMs, setTotalDurationMs] = useState(0);

  // Progress ramp timer for determinate bar while awaiting server
  const rampTimerRef = useRef<number | null>(null);

  // Mirror isPlaying in a ref for event handlers
  const isPlayingRef = useRef<boolean>(false);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Persisted theme hydration gate to avoid overwriting stored theme on mount
  const themeHydratedRef = useRef<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const th = localStorage.getItem("rf_theme");
      if (th) setTheme(th);
    } catch {}
    themeHydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (typeof document === "undefined" || !themeHydratedRef.current) return;
    document.documentElement.classList.remove(
      "theme-white",
      "theme-dark",
      "theme-beige",
    );
    document.documentElement.classList.add(`theme-${theme}`);
    try {
      localStorage.setItem("rf_theme", theme);
    } catch {}
  }, [theme]);

  // Hydrate persisted settings and text after mount (prevents hydration mismatch)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const t = localStorage.getItem("rf_text");
      if (t && t.trim()) {
        setText(t);
        setIsPlaceholder(false);
      }
      const v = localStorage.getItem("rf_voice");
      if (v) setVoice(v);
      const sp = parseFloat(localStorage.getItem("rf_speed") || "1");
      if (!Number.isNaN(sp)) setSpeed(Math.min(2, Math.max(0.5, sp)));
      const al = localStorage.getItem("rf_align") as any;
      if (al === "left" || al === "center" || al === "justify") setAlign(al);
      const fs = localStorage.getItem("rf_fontSize") as any;
      if (fs === "sm" || fs === "md" || fs === "lg") setFontSize(fs);
      const ra = localStorage.getItem("rf_readAnim");
      if (ra === "1" || ra === "0") setReadAnim(ra === "1");
      // hydrate last used email for entitlement checks
      const le = localStorage.getItem("rf_email_last") || "";
      if (le) setEmail(le);
      // theme is handled in separate hydration effect above
    } catch {}
    // Fetch entitlement status (prefer local email if present)
    (async () => {
      try {
        const le =
          typeof window !== "undefined"
            ? localStorage.getItem("rf_email_last") || ""
            : "";
        const url = le
          ? `/api/entitlements?email=${encodeURIComponent(le)}`
          : "/api/entitlements";
        const r = await fetch(url);
        const j = await r.json();
        if (j?.email) setEmail(j.email);
        if (j?.entitlement)
          setEntInfo({
            planId: j.entitlement.planId,
            periodEnd: j.entitlement.periodEnd,
          });
        if (j?.entitled) {
          setEntitled(true);
          // Enrich missing planId with a background verify if absent
          if (!j?.entitlement?.planId && (j?.email || le)) {
            try {
              await fetch("/api/whop/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: j?.email || le }),
              });
              const r3 = await fetch(
                `/api/entitlements?email=${encodeURIComponent(j?.email || le)}`,
              );
              const j3 = await r3.json();
              if (j3?.entitlement)
                setEntInfo({
                  planId: j3.entitlement.planId,
                  periodEnd: j3.entitlement.periodEnd,
                });
            } catch {}
          }
          return;
        }
        // Attempt active verification if we have a local email but not entitled
        if (le) {
          try {
            await fetch("/api/whop/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: le }),
            });
          } catch {}
          try {
            const r2 = await fetch(
              `/api/entitlements?email=${encodeURIComponent(le)}`,
            );
            const j2 = await r2.json();
            if (j2?.entitlement)
              setEntInfo({
                planId: j2.entitlement.planId,
                periodEnd: j2.entitlement.periodEnd,
              });
            if (j2?.entitled) setEntitled(true);
          } catch {}
        }
      } catch {}
    })();
  }, []);

  // Persist text/settings
  useEffect(() => {
    if (!isPlaceholder) localStorage.setItem("rf_text", text);
  }, [text, isPlaceholder]);
  useEffect(() => {
    localStorage.setItem("rf_voice", voice);
  }, [voice]);
  useEffect(() => {
    localStorage.setItem("rf_speed", String(speed));
  }, [speed]);
  useEffect(() => {
    localStorage.setItem("rf_align", align);
  }, [align]);
  useEffect(() => {
    localStorage.setItem("rf_fontSize", fontSize);
  }, [fontSize]);
  useEffect(() => {
    localStorage.setItem("rf_sidebarOpen", sidebarOpen ? "1" : "0");
  }, [sidebarOpen]);
  useEffect(() => {
    localStorage.setItem("rf_readAnim", readAnim ? "1" : "0");
  }, [readAnim]);
  useEffect(() => {
    try {
      if (email) localStorage.setItem("rf_email_last", email);
    } catch {}
  }, [email]);

  // Toast helper
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  }, []);

  const reTokenize = useCallback((value: string) => {
    const tk = tokenize(value);
    setTokens(tk.tokens);
  }, []);

  useEffect(() => {
    reTokenize(text);
  }, [reTokenize, text]);

  // When text changes, clear existing audio so Play fetches new synthesis without refresh
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.src = "";
    setIsPlaying(false);
    setSegments([]);
    setSegmentOffsets([]);
    setTimepoints([]);
    setActiveIndex(-1);
  }, [text]);

  // Debounce to mark stale state after edits settle
  const [stale, setStale] = useState<boolean>(false);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    staleTimerRef.current = setTimeout(() => setStale(true), 500);
    return () => {
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    };
  }, [text]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el || mode !== "edit") return;
    const shouldBe = isPlaceholder ? PLACEHOLDER : text;
    const isFocused =
      typeof document !== "undefined" && document.activeElement === el;
    // Only sync content when not focused (initial mount, after remount, or switching back to edit)
    if (!isFocused && el.innerText !== shouldBe) {
      el.innerText = shouldBe;
    }
  }, [mode, isPlaceholder, text]);

  const pendingSeekWiRef = useRef<number | null>(null);

  // Measure actual durations in the browser to avoid metadata drift
  const probeDurations = async (urls: { url: string }[]): Promise<number[]> => {
    return await Promise.all(
      urls.map(
        (s) =>
          new Promise<number>((resolve) => {
            try {
              const a = new Audio();
              a.preload = "metadata";
              a.src = s.url;
              const done = () => {
                const d =
                  isFinite(a.duration) && a.duration > 0
                    ? Math.round(a.duration * 1000)
                    : 0;
                resolve(d);
              };
              a.addEventListener("loadedmetadata", done, { once: true });
              a.addEventListener("error", () => resolve(0), { once: true });
              // Fallback timeout
              setTimeout(done, 3000);
            } catch {
              resolve(0);
            }
          }),
      ),
    );
  };

  const PROG_INITIAL = 1;
  const PROG_BATCH = 5;
  const progTokenRef = useRef<number>(0);

  const appendProgressive = useCallback(
    async (
      urls: { url: string; durationMs: number; startWordIndex: number }[],
      totalWords: number,
    ) => {
      // Append to refs
      const oldSegs = segmentsRef.current;
      const newSegs = [...oldSegs, ...urls];
      segmentsRef.current = newSegs;
      // Measure only appended segments
      const measured = await probeDurations(urls);
      // Extend measured durations
      const md = measuredDurMsRef.current.slice();
      for (let i = 0; i < measured.length; i++)
        md.push(measured[i] || urls[i].durationMs || 0);
      measuredDurMsRef.current = md;
      // Recompute offsets fully for simplicity
      const starts: number[] = [];
      let acc = 0;
      for (let i = 0; i < newSegs.length; i++) {
        starts.push(acc);
        acc += Math.max(0, md[i] || newSegs[i].durationMs || 0);
      }
      durOffsetsRef.current = starts;
      // Recompute words per segment
      const wordsPer: number[] = [];
      for (let i = 0; i < newSegs.length; i++) {
        const startWi = newSegs[i].startWordIndex;
        const endWi =
          i + 1 < newSegs.length
            ? newSegs[i + 1].startWordIndex
            : totalWords || startWi;
        wordsPer.push(Math.max(0, endWi - startWi));
      }
      wordsPerSegRef.current = wordsPer;
    },
    [probeDurations],
  );

  const prepareRequest = useCallback(
    async (opts?: {
      voice?: string;
      speed?: number;
      text?: string;
      container?: "ogg" | "mp3";
      progressive?: boolean;
      preview?: boolean;
    }) => {
      const v = opts?.voice ?? voice;
      const sp = opts?.speed ?? speed;
      const ttxt = opts?.text ?? text;
      // Force MP3 for more robust playback across browsers and to avoid artifacts between segments
      const cont = opts?.container ?? "mp3";
      containerRef.current = cont;
      fallbackTriedRef.current = false;

      setLoading(true);
      setProgress(0.05);
      // Start a time-based ramp up to ~70% while waiting for the server
      if (typeof window !== "undefined") {
        if (rampTimerRef.current) {
          clearInterval(rampTimerRef.current);
          rampTimerRef.current = null;
        }
        const start = Date.now();
        const BASE = 0.05; // initial progress
        const LIMIT = 0.7; // max before response
        const DURATION = 9000; // ms to reach LIMIT if server is slow
        rampTimerRef.current = window.setInterval(() => {
          const t = Date.now() - start;
          const ratio = Math.max(0, Math.min(1, t / DURATION));
          const target = BASE + ratio * (LIMIT - BASE);
          setProgress((v) => (v < target ? target : v));
          if (target >= LIMIT) {
            if (rampTimerRef.current) {
              clearInterval(rampTimerRef.current);
              rampTimerRef.current = null;
            }
          }
        }, 100);
      }
      try {
        const progressive = !!opts?.progressive;
        const reqBody: any = {
          text: ttxt,
          voice: v,
          speed: sp,
          format: "bundle",
          container: cont,
        };
        if (opts?.preview) {
          reqBody.preview = true;
          reqBody.previewSec = PREVIEW_SECONDS;
        }
        if (progressive) {
          reqBody.startChunk = 0;
          reqBody.maxChunks = PROG_INITIAL;
          reqBody.includeMarks = false;
          reqBody.includeDurations = false;
        }
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reqBody),
        });
        // Stop ramp as soon as we have a response and advance progress
        if (rampTimerRef.current) {
          clearInterval(rampTimerRef.current);
          rampTimerRef.current = null;
        }
        setProgress((v) => (v < 0.75 ? 0.75 : v));
        // Allow the 75% update to paint before heavy JSON parsing
        await nextFrame();
        if (!res.ok) {
          let msg = `TTS request failed (HTTP ${res.status})`;
          try {
            const ct = res.headers.get("content-type") || "";
            if (ct.includes("application/json")) {
              const j = await res.json();
              const errVal = (j as any)?.error?.message ?? (j as any)?.error;
              if (errVal)
                msg =
                  typeof errVal === "string" ? errVal : JSON.stringify(errVal);
            } else {
              const t = await res.text();
              if (t) msg = t;
            }
          } catch {}
          throw new Error(msg);
        }
        const data = await res.json();
        // Parsing complete; reflect into progress and let it paint
        setProgress((v) => (v < 0.85 ? 0.85 : v));
        await nextFrame();
        const segs =
          (data.segments as {
            idx: number;
            audioBase64: string;
            durationMs: number;
            startWordIndex: number;
            mime?: string;
          }[]) || [];
        const chunkEnd: number = Number((data as any).chunkEnd ?? segs.length);
        const totalChunksResp: number = Number(
          (data as any).totalChunks ?? (segs.length ? 1 : 0),
        );
        const mimeDefault =
          cont === "ogg" ? "audio/ogg; codecs=opus" : "audio/mpeg";
        const urls = segs.map((s) => ({
          url: `data:${s.mime || mimeDefault};base64,${s.audioBase64}`,
          durationMs: s.durationMs,
          startWordIndex: s.startWordIndex ?? 0,
        }));
        const totalWords = Number((data as any).totalWords ?? 0) || 0;
        totalWordsRef.current = totalWords;
        if (rampTimerRef.current) {
          clearInterval(rampTimerRef.current);
          rampTimerRef.current = null;
        }
        setSegments(urls);
        segmentsRef.current = urls;
        const bundleTps =
          (data.timepoints as { wordIndex: number; tMs: number }[]) || [];
        dbg("bundle timepoints", bundleTps.length);
        // Build quick maps and per-segment ranges based on timepoints
        const indexByWi = new Map<number, number>();
        const tpMap = new Map<number, number>();
        for (let i = 0; i < bundleTps.length; i++) {
          indexByWi.set(bundleTps[i].wordIndex, i);
          tpMap.set(bundleTps[i].wordIndex, bundleTps[i].tMs);
        }
        tpByWiRef.current = tpMap;
        // Derive per-segment [startIdx, endIdx) and segment start tMs
        const ranges: { startIdx: number; endIdx: number; startWi: number }[] =
          [];
        const segStartMs: number[] = [];
        for (let i = 0; i < urls.length; i++) {
          const startWi = urls[i].startWordIndex;
          const startIdx = indexByWi.get(startWi) ?? 0;
          const nextStartWi =
            i + 1 < urls.length ? urls[i + 1].startWordIndex : null;
          const endIdx =
            nextStartWi != null
              ? (indexByWi.get(nextStartWi) ?? bundleTps.length)
              : bundleTps.length;
          ranges.push({ startIdx, endIdx, startWi });
          const startMs =
            bundleTps[startIdx]?.tMs ??
            (segStartMs.length ? segStartMs[segStartMs.length - 1] : 0);
          segStartMs.push(startMs);
        }
        segmentRangesRef.current = ranges;
        segStartMsRef.current = segStartMs;
        // Also keep a state copy for components that rely on it
        const offs: number[] = segStartMs.slice();
        setSegmentOffsets(offs);
        setTimepoints(bundleTps);
        timepointsRef.current = bundleTps;
        // Initial mapping ready; push progress forward before metadata probing and allow paint
        setProgress((v) => (v < 0.9 ? 0.9 : v));
        await nextFrame();

        // Use server-reported durations immediately so playback can start without waiting for metadata probing
        const initDurations = urls.map((u) => u.durationMs || 3000);
        measuredDurMsRef.current = initDurations;
        const durOffsets: number[] = [];
        let accDur = 0;
        for (const d of initDurations) {
          durOffsets.push(accDur);
          accDur += Math.max(0, d);
        }
        durOffsetsRef.current = durOffsets;
        const wordsPer: number[] = [];
        for (let i = 0; i < urls.length; i++) {
          const startWi = urls[i].startWordIndex;
          const endWi =
            i + 1 < urls.length
              ? urls[i + 1].startWordIndex
              : totalWordsRef.current || startWi;
          wordsPer.push(Math.max(0, endWi - startWi));
        }
        wordsPerSegRef.current = wordsPer;

        setProgress((v) => (v < 0.95 ? 0.95 : v));

        // Probe actual durations in the background; update refs silently once available
        probeDurations(urls)
          .then((measured) => {
            const refined = measured.map((m, i) =>
              Math.max(m || 0, urls[i].durationMs || 0),
            );
            measuredDurMsRef.current = refined;
            const refOffsets: number[] = [];
            let acc = 0;
            for (const d of refined) {
              refOffsets.push(acc);
              acc += Math.max(0, d);
            }
            durOffsetsRef.current = refOffsets;
          })
          .catch(() => {});
        // Cancel any pending stale timer so synthesis stays fresh after fast play
        if (staleTimerRef.current) {
          clearTimeout(staleTimerRef.current);
          staleTimerRef.current = null;
        }
        setStale(false);

        // Progressive background fetch of remaining chunks
        if (
          opts?.progressive &&
          !opts?.preview &&
          chunkEnd < (totalChunksResp || 0)
        ) {
          const myToken = ++progTokenRef.current;
          (async () => {
            let next = chunkEnd;
            while (
              next < (totalChunksResp || 0) &&
              progTokenRef.current === myToken
            ) {
              const body: any = {
                text: ttxt,
                voice: v,
                speed: sp,
                format: "bundle",
                container: cont,
                startChunk: next,
                maxChunks: PROG_BATCH,
                includeMarks: false,
                includeDurations: false,
              };
              const r = await fetch("/api/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              });
              if (!r.ok) break;
              const d = await r.json();
              const moreSegs =
                (d.segments as {
                  idx: number;
                  audioBase64: string;
                  durationMs: number;
                  startWordIndex: number;
                  mime?: string;
                }[]) || [];
              const mimeDefault2 =
                cont === "ogg" ? "audio/ogg; codecs=opus" : "audio/mpeg";
              const moreUrls = moreSegs.map((s) => ({
                url: `data:${s.mime || mimeDefault2};base64,${s.audioBase64}`,
                durationMs: s.durationMs,
                startWordIndex: s.startWordIndex ?? 0,
              }));
              // Update totals
              totalWordsRef.current =
                Number((d as any).totalWords ?? totalWordsRef.current) ||
                totalWordsRef.current;
              await appendProgressive(moreUrls, totalWordsRef.current);
              next = Number((d as any).chunkEnd ?? next + moreUrls.length);
            }
          })().catch(() => {});
        }
      } catch (err) {
        const message = (err as Error)?.message || "TTS failed";
        showToast(message);
        setLoading(false);
        setProgress(0);
        if (rampTimerRef.current) {
          clearInterval(rampTimerRef.current);
          rampTimerRef.current = null;
        }
        throw err;
      }
    },
    [text, voice, speed, showToast],
  );

  // Keep a ref mirror of timepoints so the RAF loop doesn't depend on closures
  useEffect(() => {
    timepointsRef.current = timepoints;
  }, [timepoints]);

  const previewVoice = useCallback(async () => {
    if (previewLoading) return;
    setPreviewLoading(true);
    try {
      const cont = "mp3";
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "This is a preview of the voice.",
          voice,
          speed: 1.0,
          format: "audio",
          container: cont,
        }),
      });
      if (!res.ok) throw new Error(`Preview failed (${res.status})`);
      const data = await res.json();
      const segs =
        (data.segments as { audioBase64: string; mime?: string }[]) || [];
      if (!segs.length) return;
      if (!previewAudioRef.current && typeof window !== "undefined")
        previewAudioRef.current = new Audio();
      const aud = previewAudioRef.current!;
      const mimeDefault = "audio/mpeg";
      aud.src = `data:${segs[0].mime || mimeDefault};base64,${segs[0].audioBase64}`;
      await aud.play().catch(() => {});
    } finally {
      setPreviewLoading(false);
    }
  }, [voice, previewLoading]);

  const startPlayback = useCallback(async () => {
    setMode("read");
    // Auto-save to library when starting playback
    if (!isPlaceholder && text.trim()) {
      const title = text.trim().split("\n")[0].slice(0, 60).trim();
      const wc = tokens.filter((t) => t.t === "word").length;
      addLibraryEntry({ title, text: text.trim(), wordCount: wc });
    }
    await prepareRequest({ progressive: true });
  }, [prepareRequest, isPlaceholder, text, tokens, addLibraryEntry]);

  const seekToWord = useCallback((wi: number) => {
    if (wi < 0) return;
    const segs = segmentsRef.current;
    if (segs.length === 0) {
      pendingSeekWiRef.current = wi;
      setActiveIndex(wi);
      return;
    }
    // Find segment containing this word (last segment whose startWi <= wi)
    let target = 0;
    let lo = 0,
      hi = segs.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (segs[mid].startWordIndex <= wi) {
        target = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    const startWi = segs[target].startWordIndex;
    const count = wordsPerSegRef.current[target] || 1;
    const durMs = Math.max(
      1,
      measuredDurMsRef.current[target] || segs[target].durationMs || 1,
    );
    const posInSeg = Math.max(0, wi - startWi);
    const frac = Math.min(0.999, posInSeg / Math.max(1, count));
    const localMs = Math.floor(frac * durMs);

    if (!audioRef.current) return;
    const audio = audioRef.current;
    currentSegment.current = target;
    audio.src = segs[target].url;
    // ensure load happens before setting currentTime in some browsers
    try {
      audio.load?.();
    } catch {}
    audio.currentTime = localMs / 1000;
    if (isPlayingRef.current) {
      const p = audio.play();
      if (p && typeof p.catch === "function")
        p.catch(() => {
          audio.addEventListener(
            "canplay",
            () => {
              audio.play().catch(() => {});
            },
            { once: true },
          );
        });
    }
    setActiveIndex(wi);
  }, []);

  // RAF-based sync loop (initialize only when segments change)
  useEffect(() => {
    if (segments.length === 0) return;
    if (!audioRef.current && typeof window !== "undefined")
      audioRef.current = new Audio();
    const audio = audioRef.current!;
    currentSegment.current = 0;
    audio.preload = "auto";
    audio.src = segments[0].url;
    // playbackRate is updated by a separate effect when speed changes

    const onMeta = () => {
      const firstWi = timepointsRef.current[0]?.wordIndex ?? 0;
      if (activeRef.current < 0) {
        activeRef.current = firstWi;
        setActiveIndex(firstWi);
      }
      setProgress(1);
      setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 300);
    };
    const onError = () => {
      // Try fallback to MP3 once if OGG fails
      if (!fallbackTriedRef.current && containerRef.current === "ogg") {
        fallbackTriedRef.current = true;
        const wi = activeRef.current >= 0 ? activeRef.current : 0;
        prepareRequest({ container: "mp3", progressive: true })
          .then(() => {
            if (wi >= 0) {
              seekToWord(wi);
              if (audioRef.current && isPlayingRef.current) {
                audioRef.current.play().catch(() => {});
                setIsPlaying(true);
              }
            }
          })
          .catch(() => {
            setLoading(false);
            setProgress(0);
            showToast("Audio decode error");
          });
        return;
      }
      setLoading(false);
      setProgress(0);
      showToast("Audio decode error");
    };
    audio.addEventListener("loadedmetadata", onMeta, { once: true });
    audio.addEventListener(
      "canplay",
      () => {
        setProgress(1);
      },
      { once: true },
    );
    audio.addEventListener("error", onError);

    let rafId: number | null = null;
    const tick = () => {
      if (audio.paused) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      const segIdx = currentSegment.current;
      const segs = segmentsRef.current;
      const seg = segs[segIdx];
      if (!seg) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      const durMs = Math.max(
        1,
        measuredDurMsRef.current[segIdx] || seg.durationMs || 1,
      );
      const count = Math.max(1, wordsPerSegRef.current[segIdx] || 1);
      const startWi = seg.startWordIndex;
      const p = Math.max(
        0,
        Math.min(0.999, (audio.currentTime * 1000) / durMs),
      );
      const wi = startWi + Math.min(count - 1, Math.floor(p * count));
      if (wi !== activeRef.current) {
        dbg("index ->", wi, "at", Math.round(p * durMs));
        activeRef.current = wi;
        setActiveIndex(wi);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    const onEnded = () => {
      if (!isPlayingRef.current) return;
      const idx = currentSegment.current + 1;
      if (idx < segments.length) {
        currentSegment.current = idx;
        audio.src = segments[idx].url;
        audio.play().catch(() => {});
      } else {
        setIsPlaying(false);
        completedRef.current = true;
        // Do not cancel RAF; keep sync loop alive for restart
      }
    };

    audio.addEventListener("ended", onEnded);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      audio.pause();
      audio.removeEventListener("error", onError);
      audio.removeEventListener("ended", onEnded);
    };
  }, [segments, segmentOffsets, prepareRequest, seekToWord, showToast]);

  // Always play synthesized audio at native speed; we encode speakingRate at synthesis time
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = 1;
  }, [speed]);
  // Mirror activeIndex into ref for RAF continuity
  useEffect(() => {
    activeRef.current = activeIndex;
  }, [activeIndex]);

  const togglePlay = useCallback(async () => {
    if (!audioRef.current) return;
    const audio = audioRef.current;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    // Guard: require real text before hitting the API
    if (isPlaceholder || !text.trim()) {
      showToast("Paste some text to start listening.");
      return;
    }

    // Switch to read mode when starting playback
    setMode("read");

    // Non-entitled: start preview flow
    if (!entitledRef.current) {
      // Prepare preview without background fetch
      await prepareRequest({ progressive: false, preview: true });
      // Start timer to stop preview and show banner
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      previewTimerRef.current = window.setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.pause();
          setIsPlaying(false);
        }
        setShowBanner(true);
      }, PREVIEW_SECONDS * 1000);
    }

    // If we already have audio, not stale, not completed, and no pending seek — just resume without seeking
    if (
      segmentsRef.current.length > 0 &&
      !stale &&
      !completedRef.current &&
      pendingSeekWiRef.current == null
    ) {
      const p = audio.play();
      if (p && typeof p.catch === "function")
        p.catch(() => {
          audio.addEventListener(
            "canplay",
            () => {
              audio.play().catch(() => {});
            },
            { once: true },
          );
        });
      setIsPlaying(true);
      return;
    }

    // Determine target word to start/resume from
    let targetWi =
      pendingSeekWiRef.current != null
        ? pendingSeekWiRef.current
        : activeRef.current >= 0
          ? activeRef.current
          : (timepointsRef.current[0]?.wordIndex ?? 0);

    if (segmentsRef.current.length === 0 || stale) {
      await startPlayback();
      if (pendingSeekWiRef.current != null) targetWi = pendingSeekWiRef.current;
      pendingSeekWiRef.current = null;
      completedRef.current = false;
    }

    // If finished previously, restart from beginning
    if (completedRef.current) {
      completedRef.current = false;
      targetWi =
        segmentsRef.current[0]?.startWordIndex ??
        timepointsRef.current[0]?.wordIndex ??
        0;
    }
    // Ensure we have a valid target word from fresh timings
    if (timepointsRef.current.length > 0) {
      if (targetWi == null || targetWi < timepointsRef.current[0].wordIndex)
        targetWi = timepointsRef.current[0].wordIndex;
    }
    seekToWord(targetWi);
    const p = audio.play();
    if (p && typeof p.catch === "function")
      p.catch(() => {
        audio.addEventListener(
          "canplay",
          () => {
            audio.play().catch(() => {});
          },
          { once: true },
        );
      });
    setIsPlaying(true);
  }, [
    isPlaying,
    isPlaceholder,
    text,
    showToast,
    startPlayback,
    stale,
    seekToWord,
    prepareRequest,
    PREVIEW_SECONDS,
  ]);

  const stopAndClear = useCallback(() => {
    // Cancel background progressive fetch
    progTokenRef.current++;
    // Stop audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    // Reset all playback refs
    segmentsRef.current = [];
    segStartMsRef.current = [];
    segmentRangesRef.current = [];
    tpByWiRef.current = new Map();
    durOffsetsRef.current = [];
    measuredDurMsRef.current = [];
    wordsPerSegRef.current = [];
    timepointsRef.current = [];
    totalWordsRef.current = 0;
    completedRef.current = false;
    currentSegment.current = 0;
    pendingSeekWiRef.current = null;
    // Reset state
    setSegments([]);
    setSegmentOffsets([]);
    setTimepoints([]);
    setIsPlaying(false);
    setActiveIndex(-1);
    setCurrentTimeMs(0);
    setTotalDurationMs(0);
    setLoading(false);
    setProgress(0);
    setShowBanner(false);
    setStale(false);
    // Clear text and go back to edit mode
    setText(PLACEHOLDER);
    setIsPlaceholder(true);
    setMode("edit");
  }, [PLACEHOLDER]);

  const seekBy = useCallback((delta: number) => {
    if (!audioRef.current) return;
    const audio = audioRef.current;
    const segIdx = currentSegment.current;
    const starts = durOffsetsRef.current;
    const segs = segmentsRef.current;
    const nowGlobal = (starts[segIdx] || 0) + audio.currentTime * 1000;
    const lastDur =
      measuredDurMsRef.current[segs.length - 1] ||
      segs[segs.length - 1]?.durationMs ||
      0;
    const totalDur = (starts[segs.length - 1] || 0) + lastDur;
    const t = Math.max(0, Math.min(totalDur, nowGlobal + delta));
    // Find target segment by duration offsets
    let target = 0,
      lo = 0,
      hi = starts.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] <= t) {
        target = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    const targetStart = starts[target] || 0;
    const localMs = Math.max(0, t - targetStart);
    currentSegment.current = target;
    if (segs[target]) {
      audio.src = segs[target].url;
      try {
        audio.load?.();
      } catch {}
      audio.currentTime = localMs / 1000;
      if (isPlayingRef.current) audio.play().catch(() => {});
    }
  }, []);

  // Change voice mid-read: resynthesize and resume from current word
  const changeVoice = useCallback(
    async (v: string) => {
      // Capture position and play state BEFORE clearing anything
      const resumeWi = activeRef.current >= 0 ? activeRef.current : 0;
      const wasPlaying = isPlayingRef.current;

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      currentSegment.current = 0;
      setIsPlaying(false);
      setSegments([]);
      setSegmentOffsets([]);
      setTimepoints([]);
      setActiveIndex(-1);

      setVoice(v);
      if (typeof window !== "undefined") localStorage.setItem("rf_voice", v);

      try {
        await prepareRequest({ voice: v, progressive: true });
        seekToWord(resumeWi);
        if (wasPlaying && audioRef.current) {
          audioRef.current.play().catch(() => {});
          setIsPlaying(true);
        }
      } catch (e) {
        // keep paused on failure
      }
    },
    [prepareRequest, seekToWord],
  );

  // Change speed mid-read: resynthesize with speakingRate and resume
  const changeSpeed = useCallback(
    async (s: number) => {
      // Capture position and play state BEFORE clearing anything
      const resumeWi = activeRef.current >= 0 ? activeRef.current : 0;
      const wasPlaying = isPlayingRef.current;

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      currentSegment.current = 0;
      setIsPlaying(false);
      setSegments([]);
      setSegmentOffsets([]);
      setTimepoints([]);
      setActiveIndex(-1);

      setSpeed(s);
      if (typeof window !== "undefined")
        localStorage.setItem("rf_speed", String(s));

      try {
        await prepareRequest({ speed: s, progressive: true });
        seekToWord(resumeWi);
        if (wasPlaying && audioRef.current) {
          audioRef.current.play().catch(() => {});
          setIsPlaying(true);
        }
      } catch (e) {
        // keep paused on failure
      }
    },
    [prepareRequest, seekToWord],
  );

  // Highlight effect and auto-scroll
  useEffect(() => {
    if (activeIndex < 0) return;
    const el = readerRef.current?.querySelector(
      `[data-wi="${activeIndex}"]`,
    ) as HTMLElement | null;
    if (el) {
      const prefersReduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      el.scrollIntoView({
        block: "center",
        behavior: prefersReduced ? "auto" : "smooth",
      });
    }
  }, [activeIndex]);

  const rendered = useMemo(() => {
    const items: React.ReactNode[] = [];
    const n = tokens.length;
    // Precompute nearest next/prev word indices for each token position
    const nextWiArr: number[] = new Array(n);
    const prevWiArr: number[] = new Array(n);
    let nextWi = Number.POSITIVE_INFINITY;
    for (let i = n - 1; i >= 0; i--) {
      const t = tokens[i];
      if (t.t === "word") nextWi = t.wi!;
      nextWiArr[i] = nextWi;
    }
    let prevWi = -1;
    for (let i = 0; i < n; i++) {
      const t = tokens[i];
      if (t.t === "word") prevWi = t.wi!;
      prevWiArr[i] = prevWi;
    }

    for (let i = 0; i < n; i++) {
      const tok = tokens[i];
      if (tok.t === "word") {
        const isCurrent = activeIndex === tok.wi;
        const isRead = activeIndex > tok.wi!;
        const applyFocus = activeIndex >= 0;
        const isFuture = applyFocus && !isCurrent && !isRead;
        const cls = classNames(
          "token",
          applyFocus && isCurrent && "token-current",
          applyFocus && isRead && "token-read",
          isFuture && "token-dim",
        );
        const style: React.CSSProperties | undefined =
          readAnim && isFuture && typeof tok.wi === "number"
            ? (() => {
                const d = Math.max(1, tok.wi! - activeIndex);
                // Opacity decays with distance, clamped [0.25, 0.9]
                const opacity = Math.max(
                  0.25,
                  Math.min(0.9, 0.9 - (d - 1) * 0.02),
                );
                return {
                  opacity,
                  transition: "opacity 200ms ease",
                } as React.CSSProperties;
              })()
            : undefined;
        items.push(
          <span
            key={`w${tok.wi}`}
            data-wi={tok.wi}
            className={cls}
            style={style}
            onClick={() => seekToWord(tok.wi!)}
          >
            {tok.v}
          </span>,
        );
      } else {
        // Separator: classify based on nearest next/prev word relative to activeIndex
        const applyFocus = activeIndex >= 0;
        const nextW = nextWiArr[i];
        const prevW = prevWiArr[i];
        const isFuture =
          applyFocus && Number.isFinite(nextW) && nextW > activeIndex;
        const isRead =
          applyFocus && prevW >= 0 && prevW <= activeIndex && !isFuture;
        const cls = classNames(
          "token",
          isFuture && "token-dim",
          isRead && "token-read",
        );
        const style: React.CSSProperties | undefined =
          readAnim && isFuture && Number.isFinite(nextW)
            ? (() => {
                const d = Math.max(1, nextW - activeIndex);
                const opacity = Math.max(
                  0.25,
                  Math.min(0.9, 0.9 - (d - 1) * 0.02),
                );
                return {
                  opacity,
                  transition: "opacity 200ms ease",
                } as React.CSSProperties;
              })()
            : undefined;
        items.push(
          <span key={`s${i}`} className={cls} style={style}>
            {tok.v}
          </span>,
        );
      }
    }
    return items;
  }, [tokens, activeIndex, seekToWord, readAnim]);

  // File import
  const importFile = useCallback(
    async (file: File) => {
      if (file.type === "text/plain") {
        const t = await file.text();
        setText(t);
        setIsPlaceholder(false);
        reTokenize(t);
        return;
      }
      if (file.type === "application/pdf") {
        const pdfjs = await import("pdfjs-dist");
        // Point to CDN-hosted worker matching installed version (avoids module-object assignment error)
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        let full = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          full +=
            content.items
              .map((it: any) => (typeof it.str === "string" ? it.str : ""))
              .join(" ") + "\n\n";
        }
        const cleaned = full.trim();
        if (!cleaned) { showToast("Could not extract text from PDF."); return; }
        setText(cleaned);
        setIsPlaceholder(false);
        setMode("read");
        reTokenize(cleaned);
        return;
      }
      if (file.name.endsWith(".epub") || file.type === "application/epub+zip") {
        try {
          const { title, text: t } = await parseEpub(file);
          const content = title ? `${title}\n\n${t}` : t;
          setText(content);
          setIsPlaceholder(false);
          reTokenize(content);
        } catch {
          showToast("Failed to parse EPUB file.");
        }
        return;
      }
      showToast("Unsupported file type. Use TXT, PDF, or EPUB.");
    },
    [reTokenize, showToast],
  );

  // URL fetching
  const fetchUrl = useCallback(async () => {
    if (!urlInput.trim()) return;
    setFetchingUrl(true);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Failed to fetch URL");
        return;
      }
      const extracted = data.text as string;
      setText(extracted);
      setIsPlaceholder(false);
      setUrlInput("");
      setMode("edit");
      reTokenize(extracted);
    } catch {
      showToast("Failed to fetch URL");
    } finally {
      setFetchingUrl(false);
    }
  }, [urlInput, reTokenize, showToast]);

  // Update playback time display
  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      const segIdx = currentSegment.current;
      const starts = durOffsetsRef.current;
      const audio = audioRef.current;
      if (audio && starts.length > 0) {
        const cur = (starts[segIdx] || 0) + audio.currentTime * 1000;
        setCurrentTimeMs(Math.round(cur));
        const segs = segmentsRef.current;
        if (segs.length > 0) {
          const last = segs.length - 1;
          const tot = (starts[last] || 0) + (measuredDurMsRef.current[last] || segs[last]?.durationMs || 0);
          setTotalDurationMs(Math.round(tot));
        }
      }
    }, 250);
    return () => clearInterval(id);
  }, [isPlaying]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (document.activeElement as HTMLElement)?.isContentEditable) return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        seekBy(-10_000);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        seekBy(10_000);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const speeds = [0.75, 1, 1.25, 1.5, 2];
        const idx = speeds.indexOf(speed);
        if (idx < speeds.length - 1) changeSpeed(speeds[idx + 1]);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const speeds = [0.75, 1, 1.25, 1.5, 2];
        const idx = speeds.indexOf(speed);
        if (idx > 0) changeSpeed(speeds[idx - 1]);
      } else if (e.key === "Escape") {
        stopAndClear();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, seekBy, speed, changeSpeed, stopAndClear]);

  // Compute word count for estimated listen time
  const wordCountForTime = useMemo(() => {
    return tokens.filter(t => t.t === "word").length;
  }, [tokens]);

  function estimatedMinutes(wc: number, spd: number) {
    const wordsPerMin = 150 * spd;
    return Math.max(1, Math.round(wc / wordsPerMin));
  }

  const hasText = !isPlaceholder && text.trim().length > 0;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)", color: "var(--fg)" }}>
      {/* Top loading bar */}
      <div className={classNames("progress", loading && "active")}>
        <div className="bar" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>

      {/* Toast notification */}
      {toastMsg && (
        <div className="toast visible" role="alert">{toastMsg}</div>
      )}


      <TopBar
        voice={voice}
        onVoiceChange={changeVoice}
        speed={speed}
        onSpeedChange={changeSpeed}
        isPlaying={isPlaying}
        loading={loading}
        onTogglePlay={togglePlay}
        theme={theme}
        onThemeChange={setTheme}
        entitled={entitled}
        email={email}
        onSubscribeClick={() => setShowPricing(true)}
        onMenuClick={() => setSidebarOpen(s => !s)}
        hasAudio={segmentsRef.current.length > 0 || isPlaying}
        onStop={stopAndClear}
      />

      {/* ── MAIN CONTENT ───────────────────────────────────────────── */}
      <main className="flex-1">
        <div className="reader-content">
          {/* URL input row */}
          <div className="url-row">
            <input
              data-tour="url-input"
              type="url"
              placeholder="Paste a URL to fetch article text…"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") fetchUrl(); }}
              aria-label="Article URL"
            />
            <button
              className="btn btn-sm"
              onClick={fetchUrl}
              disabled={fetchingUrl || !urlInput.trim()}
              style={{ whiteSpace: "nowrap", fontFamily: "var(--font-ui)" }}
            >
              {fetchingUrl ? "Fetching…" : "Fetch"}
            </button>
          </div>

          {/* Empty state: show when no text */}
          {!hasText && (
            <div>
              <div
                data-tour="text-editor"
                ref={editorRef}
                className={classNames("editor", "placeholder")}
                contentEditable
                suppressContentEditableWarning
                dir="ltr"
                style={{ textAlign: "left", fontSize: "clamp(18px, 4vw, 26px)" }}
                onFocus={() => {
                  if (isPlaceholder && editorRef.current) {
                    editorRef.current.innerText = "";
                    setIsPlaceholder(false);
                  }
                }}
                onBlur={() => {
                  if (editorRef.current && !editorRef.current.innerText.trim()) {
                    editorRef.current.innerText = "Paste any text, article, or URL to start listening…";
                    setIsPlaceholder(true);
                    setText("");
                  }
                }}
                onInput={(e) => {
                  const t = (e.target as HTMLDivElement).innerText;
                  setText(t);
                  setIsPlaceholder(false);
                }}
                onPaste={(e) => {
                  setTimeout(() => {
                    const t = (e.target as HTMLDivElement).innerText;
                    setText(t);
                    setIsPlaceholder(false);
                    setMode("read");
                    reTokenize(t);
                  }, 0);
                }}
              >
                Paste any text, article, or URL to start listening…
              </div>

              <div style={{ marginTop: 24 }}>
                <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
                  Try a sample
                </p>
                <div className="samples-grid">
                  {SAMPLES.map((s, i) => (
                    <button
                      key={i}
                      className="sample-card"
                      onClick={() => {
                        setText(s.text);
                        setIsPlaceholder(false);
                        setMode("read");
                        reTokenize(s.text);
                        // Auto-play after a small delay
                        setTimeout(() => togglePlay(), 300);
                      }}
                    >
                      <div className="sample-card-label">{s.label}</div>
                      <div className="sample-card-title">{s.title}</div>
                      <div className="sample-card-preview">{s.text.slice(0, 100)}…</div>
                      <div className="sample-play-hint">▶ Play sample</div>
                    </button>
                  ))}
                </div>
              </div>
              <Library
                entries={libraryEntries}
                onSelect={(entry) => {
                  setText(entry.text);
                  setIsPlaceholder(false);
                  reTokenize(entry.text);
                }}
                onRemove={removeLibraryEntry}
              />
            </div>
          )}

          {/* Text loaded: show editor (when paused/stopped) or reader (when playing) */}
          {hasText && mode === "edit" && (
            <div>
              {/* Estimated listen time */}
              {wordCountForTime > 50 && (
                <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--muted)", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>~{estimatedMinutes(wordCountForTime, speed)} min listen at {speed}×</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-sm" onClick={() => setFontSize("sm")} aria-pressed={fontSize === "sm"} title="Small text">A−</button>
                    <button className="btn btn-sm" onClick={() => setFontSize("md")} aria-pressed={fontSize === "md"} title="Medium text">A</button>
                    <button className="btn btn-sm" onClick={() => setFontSize("lg")} aria-pressed={fontSize === "lg"} title="Large text">A+</button>
                    <label data-tour="file-import" className="btn btn-sm" htmlFor="file-input" style={{ cursor: "pointer" }}>Import</label>
                    <input
                      id="file-input"
                      type="file"
                      className="hidden"
                      accept=".txt,.epub,application/pdf,application/epub+zip"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) importFile(f);
                        e.currentTarget.value = "";
                      }}
                    />
                    <button
                      className="btn btn-sm"
                      onClick={() => {
                        if (editorRef.current) editorRef.current.innerText = "Paste any text, article, or URL to start listening…";
                        setText("");
                        setIsPlaceholder(true);
                        setSegments([]);
                        setTimepoints([]);
                        setActiveIndex(-1);
                        if (audioRef.current) {
                          audioRef.current.pause();
                          audioRef.current.src = "";
                        }
                      }}
                      title="Clear text"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}
              <div
                ref={editorRef}
                className={classNames(
                  "editor",
                  fontSize === "sm" && "reader-sm",
                  fontSize === "md" && "reader-md",
                  fontSize === "lg" && "reader-lg",
                )}
                contentEditable
                suppressContentEditableWarning
                dir="ltr"
                style={{ textAlign: align as any }}
                onFocus={() => {
                  if (isPlaceholder && editorRef.current) {
                    editorRef.current.innerText = "";
                    setIsPlaceholder(false);
                  }
                }}
                onBlur={() => {
                  if (editorRef.current && !editorRef.current.innerText.trim()) {
                    editorRef.current.innerText = "Paste any text, article, or URL to start listening…";
                    setIsPlaceholder(true);
                    setText("");
                  }
                }}
                onInput={(e) => {
                  const t = (e.target as HTMLDivElement).innerText;
                  setText(t);
                  setIsPlaceholder(false);
                }}
                onPaste={(e) => {
                  setTimeout(() => {
                    const t = (e.target as HTMLDivElement).innerText;
                    setText(t);
                    setIsPlaceholder(false);
                    setMode("read");
                    reTokenize(t);
                  }, 0);
                }}
              />
            </div>
          )}

          {hasText && mode === "read" && (
            <div>
              {/* Reader controls bar */}
              <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--muted)", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>~{estimatedMinutes(wordCountForTime, speed)} min at {speed}×{stale && <span className="badge updated" style={{ marginLeft: 8 }}>Updated</span>}</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-sm" onClick={() => setFontSize("sm")} aria-pressed={fontSize === "sm"}>A−</button>
                  <button className="btn btn-sm" onClick={() => setFontSize("md")} aria-pressed={fontSize === "md"}>A</button>
                  <button className="btn btn-sm" onClick={() => setFontSize("lg")} aria-pressed={fontSize === "lg"}>A+</button>
                  <button className="btn btn-sm" onClick={() => setMode("edit")}>Edit</button>
                </div>
              </div>
              <div
                ref={readerRef}
                className={classNames(
                  fontSize === "sm" && "reader-sm",
                  fontSize === "md" && "reader-md",
                  fontSize === "lg" && "reader-lg",
                )}
                dir="ltr"
                style={{ textAlign: align as any }}
              >
                {rendered}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Hidden audio element */}
      <audio ref={audioRef} className="hidden" preload="auto" playsInline />

      <PlaybackBar
        visible={isPlaying || (segments.length > 0 && !showBanner)}
        currentTimeMs={currentTimeMs}
        totalDurationMs={totalDurationMs}
        isPlaying={isPlaying}
        onTogglePlay={togglePlay}
        onSeekBy={seekBy}
        onSeekToFraction={(frac) => {
          const target = frac * totalDurationMs;
          const starts = durOffsetsRef.current;
          const segs = segmentsRef.current;
          let seg = 0;
          for (let i = starts.length - 1; i >= 0; i--) {
            if (starts[i] <= target) { seg = i; break; }
          }
          if (segs[seg] && audioRef.current) {
            currentSegment.current = seg;
            audioRef.current.src = segs[seg].url;
            const localMs = target - (starts[seg] || 0);
            audioRef.current.currentTime = localMs / 1000;
            if (isPlayingRef.current) audioRef.current.play().catch(() => {});
          }
        }}
      />

      <UpgradeBanner
        visible={showBanner && !entitled}
        estimatedMinutes={wordCountForTime > 0 ? estimatedMinutes(wordCountForTime, speed) : 0}
        email={email}
        onEmailChange={setEmail}
        onDismiss={() => setShowBanner(false)}
        onVerifyEmail={() => { setShowBanner(false); setShowPricing(true); }}
      />

      {/* Mobile drawer for settings */}
      <div className={classNames("mobile-drawer", sidebarOpen && "open")}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontFamily: "var(--font-ui)", fontSize: 16, fontWeight: 600 }}>Settings</h2>
          <button className="btn btn-sm" onClick={() => setSidebarOpen(false)}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: "var(--font-ui)" }}>
          <div>
            <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 6 }}>Voice</label>
            <select className="btn" value={voice} onChange={(e) => changeVoice(e.target.value)} style={{ width: "100%" }}>
              {VOICES.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 6 }}>Speed</label>
            <div className="speed-seg" style={{ width: "100%" }}>
              {([0.75, 1, 1.25, 1.5, 2] as number[]).map((s) => (
                <button key={s} aria-pressed={speed === s} onClick={() => changeSpeed(s)} style={{ flex: 1 }}>
                  {s}×
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 6 }}>Theme</label>
            <div style={{ display: "flex", gap: 8 }}>
              {["white", "beige", "dark"].map((t) => (
                <button key={t} className="btn" aria-pressed={theme === t} onClick={() => setTheme(t)} style={{ flex: 1, textTransform: "capitalize" }}>{t}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 6 }}>Text alignment</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["left", "center", "justify"] as const).map((a) => (
                <button key={a} className="btn" aria-pressed={align === a} onClick={() => setAlign(a)} style={{ flex: 1 }}>{a}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="btn" htmlFor="file-input-mobile" style={{ display: "block", textAlign: "center", cursor: "pointer" }}>Import TXT/PDF/EPUB</label>
            <input
              id="file-input-mobile"
              type="file"
              className="hidden"
              accept=".txt,.epub,application/pdf,application/epub+zip"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFile(f);
                e.currentTarget.value = "";
                setSidebarOpen(false);
              }}
            />
          </div>
          {entitled ? (
            <div style={{ fontSize: 13 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Active plan</div>
              <div style={{ color: "var(--muted)" }}>{email || "—"}</div>
              <div style={{ color: "var(--muted)" }}>{planLabelFromId(entInfo?.planId) || entInfo?.planId || "—"}</div>
            </div>
          ) : (
            <button className="btn btn-primary" onClick={() => { setShowPricing(true); setSidebarOpen(false); }} style={{ width: "100%" }}>
              Subscribe
            </button>
          )}
          <div style={{ fontSize: 12, color: "var(--muted)", borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Keyboard shortcuts</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div><kbd className="kbd-hint">Space</kbd> Play/Pause</div>
              <div><kbd className="kbd-hint">←/→</kbd> Skip 10s</div>
              <div><kbd className="kbd-hint">↑/↓</kbd> Speed up/down</div>
              <div><kbd className="kbd-hint">Esc</kbd> Stop</div>
            </div>
          </div>
        </div>
      </div>
      {sidebarOpen && (
        <div className="mobile-drawer-overlay visible" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Pricing modal (explicit subscribe) */}
      <PricingModal
        open={showPricing}
        email={email}
        onClose={() => setShowPricing(false)}
        context={modalContext}
      />

      {/* First-time walkthrough tour */}
      <Walkthrough />
    </div>
  );
}
