/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VOICES } from "@/components/voices";

// Debug toggle: set window.DEBUG_FOCUS = true in console to enable verbose logs
const DEBUG_FOCUS: boolean = typeof window !== 'undefined' && !!(window as any).DEBUG_FOCUS;
const dbg = (...args: any[]) => { if (DEBUG_FOCUS) console.log('[FOCUS]', ...args); };

// Tokenizer consistent with the server
const TOKEN_RE = /([A-Za-z0-9][A-Za-z0-9'’\-]*|\s+|[^\sA-Za-z0-9]+)/g;

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
const nextFrame = () => new Promise<void>((resolve) => {
  if (typeof window === 'undefined') return resolve();
  requestAnimationFrame(() => resolve());
});

export default function Home() {
  // UI state (SSR-safe defaults; hydrate from localStorage after mount)
  const [theme, setTheme] = useState<string>('white');
  const [voice, setVoice] = useState<string>(VOICES[0].id);
  const [speed, setSpeed] = useState<number>(1.0);
  const [pitch, setPitch] = useState<number>(0);
  const [align, setAlign] = useState<"left" | "center" | "justify">('center');
  const [fontSize, setFontSize] = useState<"sm" | "md" | "lg">('md');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const asideRef = useRef<HTMLElement | null>(null);
  const [mode, setMode] = useState<"edit" | "read">("edit");

  // Editor and reader
  const editorRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<HTMLDivElement>(null);

  const PLACEHOLDER = "Paste text here…";
  const [text, setText] = useState<string>(PLACEHOLDER);
  const [isPlaceholder, setIsPlaceholder] = useState<boolean>(true);
  const [tokens, setTokens] = useState<Token[]>([]);
  // const [totalWords, setTotalWords] = useState(0);

  // Playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [segments, setSegments] = useState<{ url: string; durationMs: number; startWordIndex: number }[]>([]);
  const [segmentOffsets, setSegmentOffsets] = useState<number[]>([]);
  const [timepoints, setTimepoints] = useState<{ wordIndex: number; tMs: number }[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentSegment = useRef(0);
  const timepointsRef = useRef<{ wordIndex: number; tMs: number }[]>([]);
  const activeRef = useRef<number>(-1);
  const containerRef = useRef<'ogg' | 'mp3'>('ogg');
  const fallbackTriedRef = useRef<boolean>(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  // Refs for immediate access without waiting for React state flush
  const segmentsRef = useRef<{ url: string; durationMs: number; startWordIndex: number }[]>([]);
  const segStartMsRef = useRef<number[]>([]); // from timing map (may be rough)
  const segmentRangesRef = useRef<{ startIdx: number; endIdx: number; startWi: number }[]>([]);
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
  useEffect(() => { entitledRef.current = entitled; }, [entitled]);
  const [email, setEmail] = useState<string>("");
  const [showPay, setShowPay] = useState<boolean>(false);
  const [linkEmail, setLinkEmail] = useState<string>("");
  const PREVIEW_SECONDS = Math.max(5, Math.min(600, Number(process.env.NEXT_PUBLIC_PREVIEW_SECONDS || "30")));
  const previewTimerRef = useRef<number | null>(null);

  // Progress ramp timer for determinate bar while awaiting server
  const rampTimerRef = useRef<number | null>(null);

  // Mirror isPlaying in a ref for event handlers
  const isPlayingRef = useRef<boolean>(false);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // Persisted theme hydration gate to avoid overwriting stored theme on mount
  const themeHydratedRef = useRef<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const th = localStorage.getItem('rf_theme');
      if (th) setTheme(th);
    } catch {}
    themeHydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined' || !themeHydratedRef.current) return;
    document.documentElement.classList.remove("theme-white", "theme-dark", "theme-beige");
    document.documentElement.classList.add(`theme-${theme}`);
    try { localStorage.setItem("rf_theme", theme); } catch {}
  }, [theme]);

  // Hydrate persisted settings and text after mount (prevents hydration mismatch)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const t = localStorage.getItem('rf_text');
      if (t && t.trim()) { setText(t); setIsPlaceholder(false); }
      const v = localStorage.getItem('rf_voice'); if (v) setVoice(v);
      const sp = parseFloat(localStorage.getItem('rf_speed') || '1'); if (!Number.isNaN(sp)) setSpeed(Math.min(2, Math.max(0.5, sp)));
      const al = localStorage.getItem('rf_align') as any; if (al === 'left' || al === 'center' || al === 'justify') setAlign(al);
      const fs = localStorage.getItem('rf_fontSize') as any; if (fs === 'sm' || fs === 'md' || fs === 'lg') setFontSize(fs);
      const so = localStorage.getItem('rf_sidebarOpen'); if (so === '0' || so === '1') setSidebarOpen(so === '1');
      const ra = localStorage.getItem('rf_readAnim'); if (ra === '1' || ra === '0') setReadAnim(ra === '1');
      // theme is handled in separate hydration effect above
    } catch {}
    // Fetch entitlement status
    fetch('/api/entitlements').then(r => r.json()).then((j) => {
      if (j?.email) setEmail(j.email);
      if (j?.entitled) setEntitled(true);
    }).catch(() => {});
  }, []);

  // Persist text/settings
  useEffect(() => { if (!isPlaceholder) localStorage.setItem('rf_text', text); }, [text, isPlaceholder]);
  useEffect(() => { localStorage.setItem('rf_voice', voice); }, [voice]);
  useEffect(() => { localStorage.setItem('rf_speed', String(speed)); }, [speed]);
  useEffect(() => { localStorage.setItem('rf_align', align); }, [align]);
  useEffect(() => { localStorage.setItem('rf_fontSize', fontSize); }, [fontSize]);
  useEffect(() => { localStorage.setItem('rf_sidebarOpen', sidebarOpen ? '1' : '0'); }, [sidebarOpen]);
  useEffect(() => { localStorage.setItem('rf_readAnim', readAnim ? '1' : '0'); }, [readAnim]);

  // Auto open/close sidebar based on cursor proximity
  useEffect(() => {
    const HOTSPOT = 48; // px from right edge
    function onMove(e: MouseEvent) {
      const x = e.clientX, y = e.clientY;
      const nearRight = (window.innerWidth - x) <= HOTSPOT;
      const el = asideRef.current;
      const rect = el?.getBoundingClientRect();
      const inAside = rect ? (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) : false;
      if (!sidebarOpen && nearRight) {
        setSidebarOpen(true);
      } else if (sidebarOpen && !inAside && !nearRight) {
        setSidebarOpen(false);
      }
    }
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [sidebarOpen]);

  const reTokenize = useCallback((value: string) => {
    const tk = tokenize(value);
    setTokens(tk.tokens);
    // setTotalWords(tk.totalWords);
  }, []);

  useEffect(() => { reTokenize(text); }, [reTokenize, text]);
  // When text changes, clear existing audio so Play fetches new synthesis without refresh
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.src = '';
    setIsPlaying(false);
    setSegments([]);
    setSegmentOffsets([]);
    setTimepoints([]);
    setActiveIndex(-1);
  }, [text]);
  // Debounce to mark stale state after edits settle
  useEffect(() => {
    const id = setTimeout(() => setStale(true), 500);
    return () => clearTimeout(id);
  }, [text]);
  useEffect(() => {
    const el = editorRef.current;
    if (!el || mode !== 'edit') return;
    const shouldBe = isPlaceholder ? PLACEHOLDER : text;
    const isFocused = typeof document !== 'undefined' && document.activeElement === el;
    // Only sync content when not focused (initial mount, after remount, or switching back to edit)
    if (!isFocused && el.innerText !== shouldBe) {
      el.innerText = shouldBe;
    }
  }, [mode, isPlaceholder, text]);

  const pendingSeekWiRef = useRef<number | null>(null);
  const [stale, setStale] = useState<boolean>(false);

  // Measure actual durations in the browser to avoid metadata drift
  const probeDurations = async (urls: { url: string }[]): Promise<number[]> => {
    return await Promise.all(urls.map((s) => new Promise<number>((resolve) => {
      try {
        const a = new Audio();
        a.preload = 'metadata';
        a.src = s.url;
        const done = () => {
          const d = isFinite(a.duration) && a.duration > 0 ? Math.round(a.duration * 1000) : 0;
          resolve(d);
        };
        a.addEventListener('loadedmetadata', done, { once: true });
        a.addEventListener('error', () => resolve(0), { once: true });
        // Fallback timeout
        setTimeout(done, 3000);
      } catch {
        resolve(0);
      }
    })));
  };

  const PROG_INITIAL = 2;
  const PROG_BATCH = 3;
  const progTokenRef = useRef<number>(0);

  const appendProgressive = useCallback(async (urls: { url: string; durationMs: number; startWordIndex: number }[], totalWords: number) => {
    // Append to refs
    const oldSegs = segmentsRef.current;
    const startIdx = oldSegs.length;
    const newSegs = [...oldSegs, ...urls];
    segmentsRef.current = newSegs;
    // Measure only appended segments
    const measured = await probeDurations(urls);
    // Extend measured durations
    const md = measuredDurMsRef.current.slice();
    for (let i = 0; i < measured.length; i++) md.push(measured[i] || (urls[i].durationMs || 0));
    measuredDurMsRef.current = md;
    // Recompute offsets fully for simplicity
    const starts: number[] = [];
    let acc = 0;
    for (let i = 0; i < newSegs.length; i++) { starts.push(acc); acc += Math.max(0, md[i] || newSegs[i].durationMs || 0); }
    durOffsetsRef.current = starts;
    // Recompute words per segment
    const wordsPer: number[] = [];
    for (let i = 0; i < newSegs.length; i++) {
      const startWi = newSegs[i].startWordIndex;
      const endWi = i + 1 < newSegs.length ? newSegs[i + 1].startWordIndex : (totalWords || startWi);
      wordsPer.push(Math.max(0, endWi - startWi));
    }
    wordsPerSegRef.current = wordsPer;
  }, [probeDurations]);

  const prepareRequest = useCallback(async (opts?: { voice?: string; speed?: number; text?: string; container?: 'ogg' | 'mp3'; progressive?: boolean; preview?: boolean }) => {
    const v = opts?.voice ?? voice;
    const sp = opts?.speed ?? speed;
    const ttxt = opts?.text ?? text;
    const cont = opts?.container ?? (typeof window !== 'undefined' ? (() => {
      const el = document.createElement('audio');
      const can = el.canPlayType('audio/ogg; codecs=opus');
      return can !== '' ? 'ogg' : 'mp3';
    })() : 'ogg');
    containerRef.current = cont;
    fallbackTriedRef.current = false;

    setLoading(true);
    setProgress(0.05);
    // Start a time-based ramp up to ~70% while waiting for the server
    if (typeof window !== 'undefined') {
      if (rampTimerRef.current) { clearInterval(rampTimerRef.current); rampTimerRef.current = null; }
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
          if (rampTimerRef.current) { clearInterval(rampTimerRef.current); rampTimerRef.current = null; }
        }
      }, 100);
    }
    try {
      const progressive = !!opts?.progressive;
      const reqBody: any = { text: ttxt, voice: v, speed: sp, format: 'bundle', container: cont };
      if (opts?.preview) { reqBody.preview = true; reqBody.previewSec = PREVIEW_SECONDS; }
      if (progressive) { reqBody.startChunk = 0; reqBody.maxChunks = PROG_INITIAL; reqBody.includeMarks = false; reqBody.includeDurations = false; }
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody)
      });
      // Stop ramp as soon as we have a response and advance progress
      if (rampTimerRef.current) { clearInterval(rampTimerRef.current); rampTimerRef.current = null; }
      setProgress((v) => (v < 0.75 ? 0.75 : v));
      // Allow the 75% update to paint before heavy JSON parsing
      await nextFrame();
      if (!res.ok) {
        let msg = `TTS request failed (HTTP ${res.status})`;
        try {
          const ct = res.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const j = await res.json();
            const errVal = (j as any)?.error?.message ?? (j as any)?.error;
            if (errVal) msg = typeof errVal === 'string' ? errVal : JSON.stringify(errVal);
          } else {
            const t = await res.text(); if (t) msg = t;
          }
        } catch {}
        throw new Error(msg);
      }
      const data = await res.json();
      // Parsing complete; reflect into progress and let it paint
      setProgress((v) => (v < 0.85 ? 0.85 : v));
      await nextFrame();
      const segs = (data.segments as { idx: number; audioBase64: string; durationMs: number; startWordIndex: number; mime?: string }[]) || [];
      const chunkEnd: number = Number((data as any).chunkEnd ?? segs.length);
      const totalChunksResp: number = Number((data as any).totalChunks ?? (segs.length ? 1 : 0));
      const mimeDefault = cont === 'ogg' ? 'audio/ogg; codecs=opus' : 'audio/mpeg';
      const urls = segs.map((s) => ({ url: `data:${s.mime || mimeDefault};base64,${s.audioBase64}`, durationMs: s.durationMs, startWordIndex: s.startWordIndex ?? 0 }));
      const totalWords = Number((data as any).totalWords ?? 0) || 0;
      totalWordsRef.current = totalWords;
      if (rampTimerRef.current) { clearInterval(rampTimerRef.current); rampTimerRef.current = null; }
      setSegments(urls);
      segmentsRef.current = urls;
      const bundleTps = (data.timepoints as { wordIndex: number; tMs: number }[]) || [];
      dbg('bundle timepoints', bundleTps.length);
      // Build quick maps and per-segment ranges based on timepoints
      const indexByWi = new Map<number, number>();
      const tpMap = new Map<number, number>();
      for (let i = 0; i < bundleTps.length; i++) { indexByWi.set(bundleTps[i].wordIndex, i); tpMap.set(bundleTps[i].wordIndex, bundleTps[i].tMs); }
      tpByWiRef.current = tpMap;
      // Derive per-segment [startIdx, endIdx) and segment start tMs
      const ranges: { startIdx: number; endIdx: number; startWi: number }[] = [];
      const segStartMs: number[] = [];
      for (let i = 0; i < urls.length; i++) {
        const startWi = urls[i].startWordIndex;
        const startIdx = indexByWi.get(startWi) ?? 0;
        const nextStartWi = i + 1 < urls.length ? urls[i + 1].startWordIndex : null;
        const endIdx = nextStartWi != null ? (indexByWi.get(nextStartWi) ?? bundleTps.length) : bundleTps.length;
        ranges.push({ startIdx, endIdx, startWi });
        const startMs = bundleTps[startIdx]?.tMs ?? (segStartMs.length ? segStartMs[segStartMs.length - 1] : 0);
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

      // Build duration-based offsets and word counts per segment for robust sync
      // Prefer conservative durations: use max(measured, server) to avoid running ahead
      const measured = await probeDurations(urls);
      measuredDurMsRef.current = measured.map((m, i) => Math.max(m || 0, urls[i].durationMs || 0));
      // Metadata probed; almost done
      setProgress((v) => (v < 0.93 ? 0.93 : v));
      await nextFrame();
      const durOffsets: number[] = [];
      let accDur = 0;
      for (let i = 0; i < urls.length; i++) {
        const useMs = measuredDurMsRef.current[i] || urls[i].durationMs || 0;
        durOffsets.push(accDur);
        accDur += Math.max(0, useMs);
      }
      durOffsetsRef.current = durOffsets;
      const wordsPer: number[] = [];
      for (let i = 0; i < urls.length; i++) {
        const startWi = urls[i].startWordIndex;
        const endWi = i + 1 < urls.length ? urls[i + 1].startWordIndex : (totalWordsRef.current || startWi);
        wordsPer.push(Math.max(0, endWi - startWi));
      }
      wordsPerSegRef.current = wordsPer;

      setProgress((v) => (v < 0.95 ? 0.95 : v));
      setStale(false);

      // Progressive background fetch of remaining chunks
      if ((opts?.progressive) && !opts?.preview && chunkEnd < (totalChunksResp || 0)) {
        const myToken = ++progTokenRef.current;
        (async () => {
          let next = chunkEnd;
          while (next < (totalChunksResp || 0) && progTokenRef.current === myToken) {
            const body: any = { text: ttxt, voice: v, speed: sp, format: 'bundle', container: cont, startChunk: next, maxChunks: PROG_BATCH, includeMarks: false, includeDurations: false };
            const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!r.ok) break;
            const d = await r.json();
            const moreSegs = (d.segments as { idx: number; audioBase64: string; durationMs: number; startWordIndex: number; mime?: string }[]) || [];
            const mimeDefault2 = cont === 'ogg' ? 'audio/ogg; codecs=opus' : 'audio/mpeg';
            const moreUrls = moreSegs.map((s) => ({ url: `data:${s.mime || mimeDefault2};base64,${s.audioBase64}`, durationMs: s.durationMs, startWordIndex: s.startWordIndex ?? 0 }));
            // Update totals
            totalWordsRef.current = Number((d as any).totalWords ?? totalWordsRef.current) || totalWordsRef.current;
            await appendProgressive(moreUrls, totalWordsRef.current);
            next = Number((d as any).chunkEnd ?? (next + moreUrls.length));
          }
        })().catch(() => {});
      }
    } catch (err) {
      const message = (err as Error)?.message || 'TTS failed';
      if (typeof window !== 'undefined') alert(message);
      setLoading(false);
      setProgress(0);
      if (rampTimerRef.current) { clearInterval(rampTimerRef.current); rampTimerRef.current = null; }
      throw err;
    }
  }, [text, voice, speed]);

  // Keep a ref mirror of timepoints so the RAF loop doesn't depend on closures
  useEffect(() => { timepointsRef.current = timepoints; }, [timepoints]);

  const previewVoice = useCallback(async () => {
    if (previewLoading) return;
    setPreviewLoading(true);
    try {
      const cont = (typeof window !== 'undefined') ? (() => { const a = document.createElement('audio'); const can = a.canPlayType('audio/ogg; codecs=opus'); return can !== '' ? 'ogg' : 'mp3'; })() : 'ogg';
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'This is a preview of the voice.', voice, speed: 1.0, format: 'audio', container: cont })
      });
      if (!res.ok) throw new Error(`Preview failed (${res.status})`);
      const data = await res.json();
      const segs = (data.segments as { audioBase64: string; mime?: string }[]) || [];
      if (!segs.length) return;
      if (!previewAudioRef.current && typeof window !== 'undefined') previewAudioRef.current = new Audio();
      const aud = previewAudioRef.current!;
      const mimeDefault = cont === 'ogg' ? 'audio/ogg; codecs=opus' : 'audio/mpeg';
      aud.src = `data:${segs[0].mime || mimeDefault};base64,${segs[0].audioBase64}`;
      await aud.play().catch(() => {});
    } finally {
      setPreviewLoading(false);
    }
  }, [voice, previewLoading]);

  const startPlayback = useCallback(async () => {
    setMode("read");
    await prepareRequest({ progressive: true });
  }, [prepareRequest]);

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
    let lo = 0, hi = segs.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (segs[mid].startWordIndex <= wi) { target = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    const startWi = segs[target].startWordIndex;
    const count = wordsPerSegRef.current[target] || 1;
    const durMs = Math.max(1, (measuredDurMsRef.current[target] || segs[target].durationMs || 1));
    const posInSeg = Math.max(0, wi - startWi);
    const frac = Math.min(0.999, posInSeg / Math.max(1, count));
    const localMs = Math.floor(frac * durMs);

    if (!audioRef.current) return;
    const audio = audioRef.current;
    currentSegment.current = target;
    audio.src = segs[target].url;
    // ensure load happens before setting currentTime in some browsers
    try { audio.load?.(); } catch {}
    audio.currentTime = localMs / 1000;
    if (isPlayingRef.current) {
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => {
        audio.addEventListener('canplay', () => {
          audio.play().catch(() => {});
        }, { once: true });
      });
    }
    setActiveIndex(wi);
  }, []);

  // RAF-based sync loop (initialize only when segments change)
  useEffect(() => {
    if (segments.length === 0) return;
    if (!audioRef.current && typeof window !== 'undefined') audioRef.current = new Audio();
    const audio = audioRef.current!;
    currentSegment.current = 0;
    audio.preload = 'auto';
    audio.src = segments[0].url;
    // playbackRate is updated by a separate effect when speed changes

    const onMeta = () => {
      const firstWi = timepointsRef.current[0]?.wordIndex ?? 0;
      if (activeRef.current < 0) {
        activeRef.current = firstWi;
        setActiveIndex(firstWi);
      }
      setProgress(1);
      setTimeout(() => { setLoading(false); setProgress(0); }, 300);
    };
    const onError = () => {
      // Try fallback to MP3 once if OGG fails
      if (!fallbackTriedRef.current && containerRef.current === 'ogg') {
        fallbackTriedRef.current = true;
        const wi = activeRef.current >= 0 ? activeRef.current : 0;
        prepareRequest({ container: 'mp3', progressive: true })
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
            alert('Audio decode error');
          });
        return;
      }
      setLoading(false);
      setProgress(0);
      alert('Audio decode error');
    };
    audio.addEventListener('loadedmetadata', onMeta, { once: true });
    audio.addEventListener('canplay', () => { setProgress(1); }, { once: true });
    audio.addEventListener('error', onError);

    let rafId: number | null = null;
    const tick = () => {
      if (audio.paused) { rafId = requestAnimationFrame(tick); return; }
      const segIdx = currentSegment.current;
      const segs = segmentsRef.current;
      const seg = segs[segIdx];
      if (!seg) { rafId = requestAnimationFrame(tick); return; }
      const durMs = Math.max(1, (measuredDurMsRef.current[segIdx] || seg.durationMs || 1));
      const count = Math.max(1, wordsPerSegRef.current[segIdx] || 1);
      const startWi = seg.startWordIndex;
      const p = Math.max(0, Math.min(0.999, (audio.currentTime * 1000) / durMs));
      const wi = startWi + Math.min(count - 1, Math.floor(p * count));
      if (wi !== activeRef.current) { dbg('index ->', wi, 'at', Math.round(p * durMs)); activeRef.current = wi; setActiveIndex(wi); }
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
      audio.removeEventListener('error', onError);
      audio.removeEventListener("ended", onEnded);
    };
  }, [segments, segmentOffsets, prepareRequest, seekToWord]);

  // Always play synthesized audio at native speed; we encode speakingRate at synthesis time
  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = 1; }, [speed]);
  // Mark stale on voice/speed/pitch change (so next Play regenerates)
  useEffect(() => { setStale(true); }, [voice, speed]);
  // Mirror activeIndex into ref for RAF continuity
  useEffect(() => { activeRef.current = activeIndex; }, [activeIndex]);


  const togglePlay = useCallback(async () => {
    if (!audioRef.current) return;
    const audio = audioRef.current;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    // Non-entitled: start preview flow
    if (!entitledRef.current) {
      // Prepare preview without background fetch
      await prepareRequest({ progressive: true, preview: true });
      // Open pay modal but do not block preview
      setShowPay(true);
      // Start timer to stop preview
      if (previewTimerRef.current) { clearTimeout(previewTimerRef.current); previewTimerRef.current = null; }
      previewTimerRef.current = window.setTimeout(() => {
        if (audioRef.current) { audioRef.current.pause(); setIsPlaying(false); }
        setShowPay(true);
      }, PREVIEW_SECONDS * 1000);
    }

    // If we already have audio, not stale, not completed, and no pending seek — just resume without seeking
    if (segmentsRef.current.length > 0 && !stale && !completedRef.current && pendingSeekWiRef.current == null) {
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => {
        audio.addEventListener('canplay', () => { audio.play().catch(() => {}); }, { once: true });
      });
      setIsPlaying(true);
      return;
    }

    // Determine target word to start/resume from
    let targetWi = pendingSeekWiRef.current != null
      ? pendingSeekWiRef.current
      : (activeRef.current >= 0 ? activeRef.current : (timepointsRef.current[0]?.wordIndex ?? 0));

    if (segmentsRef.current.length === 0 || stale) {
      await startPlayback();
      if (pendingSeekWiRef.current != null) targetWi = pendingSeekWiRef.current;
      pendingSeekWiRef.current = null;
      completedRef.current = false;
    }

    // If finished previously, restart from beginning
    if (completedRef.current) {
      completedRef.current = false;
      targetWi = segmentsRef.current[0]?.startWordIndex ?? (timepointsRef.current[0]?.wordIndex ?? 0);
    }
    // Ensure we have a valid target word from fresh timings
    if (timepointsRef.current.length > 0) {
      if (targetWi == null || targetWi < timepointsRef.current[0].wordIndex) targetWi = timepointsRef.current[0].wordIndex;
    }
    seekToWord(targetWi);
    const p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(() => {
      audio.addEventListener('canplay', () => { audio.play().catch(() => {}); }, { once: true });
    });
    setIsPlaying(true);
  }, [isPlaying, startPlayback, stale, seekToWord, prepareRequest, PREVIEW_SECONDS]);

  const seekBy = useCallback((delta: number) => {
    if (!audioRef.current) return;
    const audio = audioRef.current;
    const segIdx = currentSegment.current;
    const starts = durOffsetsRef.current;
    const segs = segmentsRef.current;
    const nowGlobal = (starts[segIdx] || 0) + audio.currentTime * 1000;
    const lastDur = measuredDurMsRef.current[segs.length - 1] || (segs[segs.length - 1]?.durationMs || 0);
    const totalDur = (starts[segs.length - 1] || 0) + lastDur;
    const t = Math.max(0, Math.min(totalDur, nowGlobal + delta));
    // Find target segment by duration offsets
    let target = 0, lo = 0, hi = starts.length - 1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (starts[mid] <= t) { target = mid; lo = mid + 1; } else { hi = mid - 1; } }
    const targetStart = starts[target] || 0;
    const localMs = Math.max(0, t - targetStart);
    currentSegment.current = target;
    if (segs[target]) {
      audio.src = segs[target].url;
      try { audio.load?.(); } catch {}
      audio.currentTime = localMs / 1000;
      if (isPlayingRef.current) audio.play().catch(() => {});
    }
  }, []);

  // Change voice mid-read: resynthesize and resume from current word
  const changeVoice = useCallback(async (v: string) => {
    // Pause and clear current playback to avoid mixing old/new segments
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    currentSegment.current = 0;
    setIsPlaying(false);
    setSegments([]);
    setSegmentOffsets([]);
    setTimepoints([]);
    setActiveIndex(-1);

    setVoice(v);
    if (typeof window !== 'undefined') localStorage.setItem('rf_voice', v);

    const targetWi = activeRef.current >= 0 ? activeRef.current : 0;
    pendingSeekWiRef.current = targetWi;
    try {
      await prepareRequest({ voice: v, progressive: true });
      // Seek to the previous word after new audio/timepoints are set
      setTimeout(() => {
        const wi = pendingSeekWiRef.current;
        pendingSeekWiRef.current = null;
        if (wi != null) {
          seekToWord(wi);
        }
      }, 0);
    } catch (e) {
      // keep paused on failure
    }
  }, [prepareRequest, seekToWord]);

  // Change speed mid-read: resynthesize with speakingRate and resume
  const changeSpeed = useCallback(async (s: number) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    currentSegment.current = 0;
    setIsPlaying(false);
    setSegments([]);
    setSegmentOffsets([]);
    setTimepoints([]);
    setActiveIndex(-1);

    setSpeed(s);
    if (typeof window !== 'undefined') localStorage.setItem('rf_speed', String(s));

    const targetWi = activeRef.current >= 0 ? activeRef.current : 0;
    pendingSeekWiRef.current = targetWi;
    try {
      await prepareRequest({ speed: s, progressive: true });
      setTimeout(() => {
        const wi = pendingSeekWiRef.current;
        pendingSeekWiRef.current = null;
        if (wi != null) {
          seekToWord(wi);
        }
      }, 0);
    } catch (e) {
      // keep paused on failure
    }
  }, [prepareRequest, seekToWord]);


  // Highlight effect and auto-scroll
  useEffect(() => {
    if (activeIndex < 0) return;
    const el = readerRef.current?.querySelector(`[data-wi="${activeIndex}"]`) as HTMLElement | null;
    if (el) {
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "center", behavior: prefersReduced ? "auto" : "smooth" });
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
      if (t.t === 'word') nextWi = t.wi!;
      nextWiArr[i] = nextWi;
    }
    let prevWi = -1;
    for (let i = 0; i < n; i++) {
      const t = tokens[i];
      if (t.t === 'word') prevWi = t.wi!;
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
          isFuture && "token-dim"
        );
        const style: React.CSSProperties | undefined = (readAnim && isFuture && typeof tok.wi === 'number')
          ? (() => {
              const d = Math.max(1, (tok.wi! - activeIndex));
              // Opacity decays with distance, clamped [0.25, 0.9]
              const opacity = Math.max(0.25, Math.min(0.9, 0.9 - (d - 1) * 0.02));
              return { opacity, transition: 'opacity 200ms ease' } as React.CSSProperties;
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
          </span>
        );
      } else {
        // Separator: classify based on nearest next/prev word relative to activeIndex
        const applyFocus = activeIndex >= 0;
        const nextW = nextWiArr[i];
        const prevW = prevWiArr[i];
        const isFuture = applyFocus && Number.isFinite(nextW) && nextW > activeIndex;
        const isRead = applyFocus && prevW >= 0 && prevW <= activeIndex && !isFuture;
        const cls = classNames("token", isFuture && "token-dim", isRead && "token-read");
        const style: React.CSSProperties | undefined = (readAnim && isFuture && Number.isFinite(nextW))
          ? (() => {
              const d = Math.max(1, (nextW - activeIndex));
              const opacity = Math.max(0.25, Math.min(0.9, 0.9 - (d - 1) * 0.02));
              return { opacity, transition: 'opacity 200ms ease' } as React.CSSProperties;
            })()
          : undefined;
        items.push(<span key={`s${i}`} className={cls} style={style}>{tok.v}</span>);
      }
    }
    return items;
  }, [tokens, activeIndex, seekToWord, readAnim]);

  // File import
  const importFile = useCallback(async (file: File) => {
    if (file.type === "text/plain") {
      const t = await file.text();
      setText(t);
      reTokenize(t);
      return;
    }
    if (file.type === "application/pdf") {
      const pdfjs = await import("pdfjs-dist");
      const worker = await import("pdfjs-dist/build/pdf.worker.mjs");
      // Assign worker module for pdfjs (types may be missing in package)
      ;(pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: unknown } }).GlobalWorkerOptions.workerSrc = worker;
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      let full = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        full += content.items.map((it: any) => (typeof it.str === 'string' ? it.str : '')).join(" ") + "\n\n";
      }
      setText(full.trim());
      reTokenize(full.trim());
      return;
    }
    alert("Unsupported file type. Use TXT or PDF.");
  }, [reTokenize]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top loading bar */}
      <div className={classNames("progress", loading && "active")}><div className="bar" style={{ width: `${Math.round(progress*100)}%` }} /></div>
      {/* Sidebar toggle */}
            <button className="btn sidebar-toggle" onClick={() => setSidebarOpen((s) => !s)}>Sidebar</button>

      {/* Right sidebar */}
      <aside ref={asideRef} className={classNames("sidebar", sidebarOpen && "open")}> 
        <div className="p-4 flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Controls</h2>
          <div className="flex items-center gap-2">
            <button className="btn" onClick={togglePlay}>{isPlaying ? "Pause" : "Play"}</button>
            {stale && <span className="badge updated">Updated</span>}
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm">Voice</label>
            <div className="flex gap-2 items-center flex-wrap">
              <select className="btn" value={voice} onChange={(e) => changeVoice(e.target.value)}>
                {VOICES.map((v) => (<option key={v.id} value={v.id}>{v.label}</option>))}
              </select>
              <button className="btn" onClick={previewVoice} disabled={previewLoading}>{previewLoading ? 'Preview…' : 'Preview'}</button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm">Speed</label>
            <div className="flex flex-wrap gap-2">
              {[0.5, 0.75, 1, 1.25, 1.5].map((v) => (
                <button key={v} className="btn" onClick={() => changeSpeed(v)} aria-pressed={speed===v}>
                  {v}×
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm">Theme</label>
            <select className="btn" value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="white">White</option>
              <option value="beige">Beige</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm" htmlFor="read-anim">Smooth fade future text</label>
            <input id="read-anim" type="checkbox" checked={readAnim} onChange={(e) => setReadAnim(e.target.checked)} />
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <button className="btn" onClick={() => setAlign("left")}>Left</button>
            <button className="btn" onClick={() => setAlign("center")}>Center</button>
            <button className="btn" onClick={() => setAlign("justify")}>Justify</button>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <button className="btn" onClick={() => setFontSize("sm")}>A−</button>
            <button className="btn" onClick={() => setFontSize("md")}>A</button>
            <button className="btn" onClick={() => setFontSize("lg")}>A+</button>
          </div>
          <div className="flex flex-col gap-2">
            <label className="btn" htmlFor="file">Import (TXT/PDF)</label>
            <input id="file" type="file" className="hidden" accept=".txt,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.currentTarget.value = ""; }} />
          </div>
          <div className="flex gap-2 items-center">
            <button className="btn" onClick={() => seekBy(-10_000)}>−10s</button>
            <button className="btn" onClick={() => seekBy(10_000)}>+10s</button>
          </div>
          <div className="flex gap-2 items-center">
            {mode === 'edit' ? (
              <>
                <button className="btn" onClick={() => { setMode('read'); reTokenize(text); }}>Switch to Read</button>
                <button className="btn" onClick={() => { if (editorRef.current) { editorRef.current.innerText = PLACEHOLDER; } setText(''); setIsPlaceholder(true); setMode('edit'); setSegments([]); setTimepoints([]); setActiveIndex(-1); if (audioRef.current) { audioRef.current.pause(); audioRef.current.src=''; } }}>Clear text</button>
              </>
            ) : (
              <>
                <button className="btn" onClick={() => setMode('edit')}>Edit Text</button>
                <button className="btn" onClick={() => { setMode('edit'); setTimeout(() => { if (editorRef.current) { const r = document.createRange(); r.selectNodeContents(editorRef.current); const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(r); }}, 0); }}>Select All</button>
                <button className="btn" onClick={() => { setMode('edit'); setTimeout(() => { if (editorRef.current) { editorRef.current.innerText = ''; setText(''); setIsPlaceholder(false); editorRef.current.focus(); }}, 0); }}>Clear text</button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main area */}
      <main className="container flex-1 p-6">
        {/* Editor */}
        {mode === 'edit' && (
          <div
            ref={editorRef}
            className={classNames("editor", isPlaceholder && "placeholder", fontSize === "sm" && "text-[18px]", fontSize === "md" && "text-[26px]", fontSize === "lg" && "text-[34px]")}
            contentEditable
            suppressContentEditableWarning
            dir="ltr"
            style={{ textAlign: align as any }}
            onFocus={(e) => { if (isPlaceholder && editorRef.current) { editorRef.current.innerText = ""; setIsPlaceholder(false); } }}
            onBlur={(e) => { if (editorRef.current && !editorRef.current.innerText.trim()) { editorRef.current.innerText = PLACEHOLDER; setIsPlaceholder(true); setText(""); } }}
            onInput={(e) => { const t = (e.target as HTMLDivElement).innerText; setText(t); setIsPlaceholder(false); }}
            onPaste={(e) => { setTimeout(() => { const t = (e.target as HTMLDivElement).innerText; setText(t); setIsPlaceholder(false); setMode('read'); reTokenize(t); }, 0); }}
          >
            {isPlaceholder ? PLACEHOLDER : undefined}
          </div>
        )}

        {/* Reader */}
        {mode === 'read' && (
          <div ref={readerRef} className={classNames(fontSize === "sm" && "text-[18px]", fontSize === "md" && "text-[26px]", fontSize === "lg" && "text-[34px]", "leading-relaxed")} dir="ltr"
               style={{ textAlign: align as any }}>
            {rendered}
          </div>
        )}
      </main>
      {/* Hidden audio element to ensure autoplay policies and reliable events */}
      <audio ref={audioRef} className="hidden" preload="auto" playsInline />

      {/* Pay modal (temporary placeholder until Whop embed is wired) */}
      {showPay && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:80, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={() => setShowPay(false)}>
          <div style={{ background:'var(--bg)', color:'var(--fg)', border:'1px solid var(--border)', borderRadius:8, width:420, maxWidth:'90%', padding:16 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize:18, fontWeight:600, marginBottom:8 }}>Unlock full narration</h3>
            <p style={{ fontSize:14, opacity:0.85, marginBottom:12 }}>You listened to a {PREVIEW_SECONDS}s preview. Continue listening by completing checkout.</p>
            <div className="flex" style={{ display:'flex', gap:8, marginBottom:12 }}>
              <input id="link-email" className="btn" style={{ flex:1 }} placeholder="you@example.com" value={linkEmail} onChange={(e) => setLinkEmail(e.target.value)} />
              <button className="btn" onClick={async () => {
                const em = linkEmail.trim();
                if (!em) { alert('Enter your email to continue'); return; }
                try { document.cookie = `rf_email=${encodeURIComponent(em)}; Path=/; SameSite=Lax`; } catch {}
                const checkout = process.env.NEXT_PUBLIC_WHOP_CHECKOUT_URL || '#';
                const ret = `${window.location.origin}/checkout/return?email=${encodeURIComponent(em)}`;
                // Append return and email as query params for dashboards that allow it (harmless if ignored)
                const url = checkout + (checkout.includes('?') ? '&' : '?') + `email=${encodeURIComponent(em)}&redirect=${encodeURIComponent(ret)}`;
                window.location.href = url;
              }}>Continue to Checkout</button>
              <button className="btn" onClick={() => setShowPay(false)}>Close</button>
            </div>
            <div style={{ borderTop:'1px solid var(--border)', paddingTop:12, marginTop:12 }}>
              <label className="text-sm" htmlFor="already">Purchased already?</label>
              <div className="flex" style={{ display:'flex', gap:8, marginTop:8 }}>
                <button className="btn" onClick={async () => {
                  const em = linkEmail.trim();
                  if (!em) return;
                  try { document.cookie = `rf_email=${encodeURIComponent(em)}; Path=/; SameSite=Lax`; } catch {}
                  const r = await fetch(`/api/entitlements?email=${encodeURIComponent(em)}`);
                  const j = await r.json();
                  if (j?.entitled) { setEntitled(true); setEmail(em); setShowPay(false); }
                }}>Link this email</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
