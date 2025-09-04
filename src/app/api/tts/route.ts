/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import * as mm from "music-metadata";
import { limitByIP } from "@/utils/rateLimit";
import { isEntitled } from "@/utils/entitlements";

export const runtime = "nodejs";

// Supported voices (English Chirp 3: HD)
const VOICES = new Set([
  // US
  "en-US-Chirp3-HD-Achernar",
  "en-US-Chirp3-HD-Schedar",
  // UK
  "en-GB-Chirp3-HD-Achernar",
  "en-GB-Chirp3-HD-Schedar",
  "en-GB-Chirp3-HD-Zephyr",
]);

const RequestSchema = z.object({
  text: z.string().min(1).max(100_000),
  voice: z.string().refine((v) => VOICES.has(v), { message: "Unsupported voice" }),
  speed: z.number().min(0.5).max(2.0).default(1.0),
  format: z.enum(["bundle", "audio", "marks"]).default("bundle"),
  container: z.enum(["ogg", "mp3"]).default("ogg"),
  startChunk: z.number().int().min(0).default(0).optional(),
  maxChunks: z.number().int().min(1).optional(),
  includeMarks: z.boolean().default(false).optional(),
  includeDurations: z.boolean().default(false).optional(),
  // Preview options (server may enforce regardless of client input if not entitled)
  previewSec: z.number().int().min(1).max(600).optional(),
  preview: z.boolean().optional(),
});

function languageCodeForVoice(name: string): string {
  const m = name.match(/^([a-z]{2,3}-[A-Z]{2,3})-/);
  return m ? m[1] : "en-US";
}

// Tokenize into words and separators; assign word indices only to word tokens
function tokenize(text: string) {
  const regex = /([A-Za-z0-9][A-Za-z0-9'’\-]*|\s+|[^\sA-Za-z0-9]+)/g;
  const tokens: { t: "word" | "sep"; v: string; wi?: number }[] = [];
  let m: RegExpExecArray | null;
  let wordIndex = 0;
  while ((m = regex.exec(text)) !== null) {
    const v = m[0];
    const isWord = /[A-Za-z0-9]/.test(v[0]) && /\S/.test(v);
    if (isWord) tokens.push({ t: "word", v, wi: wordIndex++ });
    else tokens.push({ t: "sep", v });
  }
  return { tokens, totalWords: wordIndex };
}

function xmlEscape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildPlainText(tokens: { t: "word" | "sep"; v: string; wi?: number }[], startWord: number, endWordExclusive: number) {
  let out = "";
  let inRange = false;
  for (const tok of tokens) {
    if (tok.t === "word") {
      const wi = tok.wi!;
      if (wi < startWord) continue;
      if (wi >= endWordExclusive) break;
      inRange = true;
      out += tok.v;
    } else {
      if (inRange) out += tok.v; // only separators between included words
    }
  }
  return out;
}

// Build SSML with <mark> before each word; returns { ssml, lastWordIndex }
function buildSSML(tokens: { t: "word" | "sep"; v: string; wi?: number }[], startWord: number, endWordExclusive: number) {
  let ssml = "<speak>";
  let inRange = false;
  for (const tok of tokens) {
    if (tok.t === "word") {
      const wi = tok.wi!;
      if (wi < startWord) continue;
      if (wi >= endWordExclusive) break;
      inRange = true;
      ssml += `<mark name="w${wi}"/>${xmlEscape(tok.v)}`;
    } else {
      if (inRange) ssml += xmlEscape(tok.v);
    }
  }
  ssml += "</speak>";
  return ssml;
}

// Chunk by sentence boundaries (prefer natural prosody), falling back to byte limits
function sentenceRanges(tokens: { t: "word" | "sep"; v: string; wi?: number }[]) {
  const ranges: { startWord: number; endWord: number }[] = [];
  let start: number | null = null;
  let lastWord: number | null = null;
  for (const tok of tokens) {
    if (tok.t === 'word') {
      if (start === null) start = tok.wi!;
      lastWord = tok.wi!;
    } else {
      if (start !== null && lastWord !== null && /[.!?]/.test(tok.v)) {
        ranges.push({ startWord: start, endWord: lastWord + 1 });
        start = null;
        lastWord = null;
      }
    }
  }
  if (start !== null && lastWord !== null && lastWord + 1 > start) {
    ranges.push({ startWord: start, endWord: lastWord + 1 });
  }
  return ranges;
}

function chunkBySentences(tokens: { t: "word" | "sep"; v: string; wi?: number }[], totalWords: number) {
  const MAX_BYTES = 4800;
  const sents = sentenceRanges(tokens);
  // If we failed to detect sentences (e.g., no punctuation), fall back to word/byte chunking
  if (sents.length === 0) {
    return chunkByBytes(tokens, totalWords);
  }
  const chunks: { startWord: number; endWord: number; ssml: string }[] = [];
  let i = 0;
  while (i < sents.length) {
    const start = sents[i].startWord;
    let end = sents[i].endWord;
    let ssml = buildSSML(tokens, start, end);
    let bytes = Buffer.byteLength(ssml);
    let j = i + 1;
    // Try to combine adjacent sentences while under limit
    while (j < sents.length) {
      const tryEnd = sents[j].endWord;
      const trySSML = buildSSML(tokens, start, tryEnd);
      const tryBytes = Buffer.byteLength(trySSML);
      if (tryBytes > MAX_BYTES) break;
      end = tryEnd;
      ssml = trySSML;
      bytes = tryBytes;
      j++;
    }
    // Ensure at least some content; if single sentence is too large, trim by words
    if (bytes > MAX_BYTES) {
      // Binary grow by words within this sentence
      let lo = start + 1, hi = end, best = lo;
      while (lo <= hi) {
        const mid = ((lo + hi) >> 1);
        const tmp = buildSSML(tokens, start, mid);
        if (Buffer.byteLength(tmp) <= MAX_BYTES) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
      }
      end = Math.max(best, start + 1);
      ssml = buildSSML(tokens, start, end);
    }
    chunks.push({ startWord: start, endWord: end, ssml });
    // Advance i to the next sentence after 'end'
    while (i < sents.length && sents[i].endWord <= end) i++;
  }
  return chunks;
}

// Legacy: Chunk by SSML byte-size (safe under 5000 bytes) for fallback
function chunkByBytes(tokens: { t: "word" | "sep"; v: string; wi?: number }[], totalWords: number) {
  const chunks: { startWord: number; endWord: number; ssml: string }[] = [];
  const MAX_BYTES = 4800; // stay below API 5000-byte limit (accounts for closing tag)
  const speakOpen = "<speak>";
  const speakClose = "</speak>";
  const openBytes = Buffer.byteLength(speakOpen);
  const closeBytes = Buffer.byteLength(speakClose);

  let start = 0;
  while (start < totalWords) {
    let ssml = speakOpen;
    let used = openBytes + closeBytes; // include closing tag upfront for accounting
    let started = false;
    let end = start;
    let lastEOSWi: number | null = null; // prefer to break at end-of-sentence

    for (const tok of tokens) {
      if (tok.t === "word") {
        const wi = tok.wi!;
        if (wi < start) continue;
        const addition = `<mark name=\"w${wi}\"/>` + xmlEscape(tok.v);
        const addBytes = Buffer.byteLength(addition);
        // Ensure we include at least one word per chunk
        if (used + addBytes > MAX_BYTES && started) {
          if (lastEOSWi !== null && lastEOSWi + 1 > start) end = lastEOSWi + 1;
          break;
        }
        ssml += addition;
        used += addBytes;
        started = true;
        end = wi + 1;
      } else {
        if (!started) continue; // ignore leading separators
        const add = xmlEscape(tok.v);
        // Mark end-of-sentence positions to improve prosody across chunks
        if (/[.!?]/.test(tok.v)) {
          lastEOSWi = end - 1; // last included word index
        }
        const addBytes = Buffer.byteLength(add);
        if (used + addBytes > MAX_BYTES) {
          if (lastEOSWi !== null && lastEOSWi + 1 > start) end = lastEOSWi + 1;
          break;
        }
        ssml += add;
        used += addBytes;
      }
    }

    if (!started) {
      // Fallback: include a single word even if very long
      const nextWord = tokens.find((t) => t.t === "word" && (t.wi ?? Infinity) >= start);
      if (!nextWord) break; // no more words
      const wi = nextWord.wi!;
      ssml = `${speakOpen}<mark name=\"w${wi}\"/>${xmlEscape(nextWord.v)}`;
      end = wi + 1;
    }

    ssml += speakClose;
    chunks.push({ startWord: start, endWord: end, ssml });
    start = end;
  }
  return chunks;
}

function parsePrivateKey(pk?: string) {
  return pk?.replace(/\\n/g, "\n");
}

function isChirpVoice(name: string) {
  return /Chirp3?-HD/i.test(name);
}

function fallbackVoiceForLanguage(lang: string) {
  // Use Neural2 voices for timepoint reference
  if (lang === "en-GB") return "en-GB-Neural2-B"; // male neutral
  return "en-US-Neural2-D"; // default male neutral
}

const DEBUG_TTS = !!process.env.DEBUG_TTS;

const PREVIEW_SECONDS_DEFAULT = Number(process.env.PREVIEW_SECONDS || "30");

export async function POST(req: NextRequest) {
  if (req.method !== "POST") return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.nextUrl.host) {
    return NextResponse.json({ error: "CORS forbidden" }, { status: 403 });
  }

  const { success } = await limitByIP(req, 60, 3600);
  if (!success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { text, voice, speed, format, container, startChunk = 0, maxChunks, includeMarks = false, includeDurations = false, previewSec, preview } = parsed.data as unknown as { text: string; voice: string; speed: number; format: "bundle" | "audio" | "marks"; container: "ogg" | "mp3"; startChunk?: number; maxChunks?: number; includeMarks?: boolean; includeDurations?: boolean; previewSec?: number; preview?: boolean };

  // Validate env early (helps client show a friendly message)
  if (!process.env.GOOGLE_PROJECT_ID || !process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    return NextResponse.json({ error: "Server not configured: set GOOGLE_PROJECT_ID, GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY" }, { status: 500 });
  }

  try {
    // Determine entitlement from cookie-bound email (best-effort)
    const email = req.cookies.get("rf_email")?.value || null;
    const entitled = await isEntitled(email);
    const effectivePreviewSec = entitled ? 0 : (typeof previewSec === 'number' ? previewSec : (preview ? PREVIEW_SECONDS_DEFAULT : 0));
    if (DEBUG_TTS) console.log("[TTS] request: voice=%s speed=%s len=%d format=%s", voice, speed, text.length, format);
    // Prepare Google TTS client
    const client = new TextToSpeechClient({
      projectId: process.env.GOOGLE_PROJECT_ID,
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: parsePrivateKey(process.env.GOOGLE_PRIVATE_KEY),
      },
    });

    // Tokenize and chunk
    const { tokens, totalWords } = tokenize(text);
    const chunks = chunkBySentences(tokens, totalWords);
    const totalChunks = chunks.length;
    const start = Math.min(Math.max(0, startChunk || 0), totalChunks);
    const endExclusive = Math.min(totalChunks, maxChunks ? start + maxChunks : totalChunks);
    if (DEBUG_TTS) console.log("[TTS] tokens=%d chunks=%d range=%d..%d", totalWords, totalChunks, start, endExclusive);

    // AUDIO-ONLY format: return segments of audio base64 and durations, honoring requested container
    if (format === "audio") {
      const useOgg = container === "ogg";
      const targetEncoding = useOgg ? "OGG_OPUS" : "MP3";
      const targetMime = useOgg ? "audio/ogg; codecs=opus" : "audio/mpeg";
      const metaMime = useOgg ? "audio/ogg" : "audio/mpeg";
      const segments: { idx: number; audioBase64: string; durationMs: number; mime: string }[] = [];
      for (let i = start; i < endExclusive; i++) {
        const c = chunks[i];
        const lang = languageCodeForVoice(voice);
        const textChunk = buildPlainText(tokens, c.startWord, c.endWord);
        const [resp] = await client.synthesizeSpeech({
          input: { text: textChunk },
          voice: { name: voice, languageCode: lang },
          audioConfig: { audioEncoding: targetEncoding, speakingRate: speed, sampleRateHertz: 48000 },
        } as any);
        const audioContent = resp.audioContent as Buffer | Uint8Array | string;
        const buf = Buffer.isBuffer(audioContent)
          ? audioContent
          : typeof audioContent === "string"
          ? Buffer.from(audioContent, "base64")
          : Buffer.from(audioContent);
        let durationMs = 0;
        if (includeDurations || effectivePreviewSec > 0) {
          try {
            const meta = await mm.parseBuffer(buf, { mimeType: metaMime });
            durationMs = Math.round((meta.format.duration || 0) * 1000);
          } catch {}
        }
        segments.push({ idx: i, audioBase64: buf.toString("base64"), durationMs, mime: targetMime });
        if (DEBUG_TTS) console.log("[TTS] audio seg %d dur=%dms bytes=%d", i, durationMs, buf.byteLength);
        if (effectivePreviewSec > 0) {
          const soFar = segments.reduce((a, s) => a + Math.max(0, s.durationMs || 0), 0);
          if (soFar >= effectivePreviewSec * 1000) break;
        }
      }
      return NextResponse.json({ segments, chunkStart: start, chunkEnd: endExclusive, totalChunks, totalWords });
    }

    // MARKS-ONLY format: return WORD timepoints normalized as { type, time, value }
    if (format === "marks") {
      const marks: { type: "word"; time: number; value: string }[] = [];
      let offsetMs = 0;
      const lang = languageCodeForVoice(voice);
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        const textChunk = buildPlainText(tokens, c.startWord, c.endWord);
        let usedVoice = voice;
        let resp: any;
        try {
          [resp] = await client.synthesizeSpeech({
            input: { text: textChunk },
            voice: { name: usedVoice, languageCode: lang },
            audioConfig: { audioEncoding: "MP3", speakingRate: speed },
            enableTimePointing: ["WORD"],
          } as any);
        } catch (_e) {
          // Fallback to Neural2 voice for WORD marks if target voice does not support it
          usedVoice = fallbackVoiceForLanguage(lang);
          [resp] = await client.synthesizeSpeech({
            input: { text: textChunk },
            voice: { name: usedVoice, languageCode: lang },
            audioConfig: { audioEncoding: "MP3", speakingRate: speed },
            enableTimePointing: ["WORD"],
          } as any);
        }
        const audioContent = resp.audioContent as Buffer | Uint8Array | string;
        const buf = Buffer.isBuffer(audioContent)
          ? audioContent
          : typeof audioContent === "string"
          ? Buffer.from(audioContent, "base64")
          : Buffer.from(audioContent);
        let durationMs = 0;
        try {
          const meta = await mm.parseBuffer(buf, { mimeType: "audio/mpeg" });
          durationMs = Math.round((meta.format.duration || 0) * 1000);
        } catch {}
        const tps = (((resp as any).timepoints) || []) as { markName: string; timeSeconds: number }[];
        for (const tp of tps) {
          marks.push({ type: "word", time: offsetMs + Math.round(Number(tp.timeSeconds) * 1000), value: tp.markName });
        }
        if (DEBUG_TTS) console.log("[TTS] marks seg %d count=%d dur=%dms", i, tps.length, durationMs);
        offsetMs += durationMs;
      }
      // Ensure monotonicity strictly increasing
      for (let i = 1; i < marks.length; i++) {
        if (marks[i].time <= marks[i - 1].time) marks[i].time = marks[i - 1].time + 1;
      }
      return NextResponse.json({ marks });
    }

    // Default bundle format (existing behavior): segments + timepoints
    // Synthesize each chunk (existing logic)
    const allTimepoints: { wordIndex: number; tMs: number }[] = [];
    const segments: { idx: number; audioBase64: string; durationMs: number; startWordIndex: number; mime: string }[] = [];
    let offsetMs = 0;

    for (let i = start; i < endExclusive; i++) {
      const c = chunks[i];
      const lang = languageCodeForVoice(voice);
      const textChunk = buildPlainText(tokens, c.startWord, c.endWord);

      if (isChirpVoice(voice)) {
        if (DEBUG_TTS) console.log("[TTS] chunk %d (Chirp): words %d..%d", i, c.startWord, c.endWord);
        let refDurationMs = 0;
        let scaledLocal: number[] = [];
        if (includeMarks) {
          // 1) Reference synthesis with SSML marks using a Neural2 voice (for timings)
          const refVoice = fallbackVoiceForLanguage(lang);
          const [refResp] = await client.synthesizeSpeech({
            input: { ssml: c.ssml },
            voice: { name: refVoice, languageCode: lang },
            audioConfig: { audioEncoding: "MP3", speakingRate: speed },
            enableTimePointing: ["SSML_MARK"],
          } as any);

          const refAudioContent = refResp.audioContent as Buffer | Uint8Array | string;
          const refBuf = Buffer.isBuffer(refAudioContent)
            ? refAudioContent
            : typeof refAudioContent === "string"
            ? Buffer.from(refAudioContent, "base64")
            : Buffer.from(refAudioContent);
          try {
            const metaR = await mm.parseBuffer(refBuf, { mimeType: "audio/mpeg" });
            refDurationMs = Math.round((metaR.format.duration || 0) * 1000);
          } catch {}
          const refTimepoints = (((refResp as any).timepoints) || []) as { markName: string; timeSeconds: number }[];
          scaledLocal = refTimepoints.map((tp) => Math.round(Number(tp.timeSeconds) * 1000));
        }

        const useOgg = container === "ogg";
        const targetEncoding = useOgg ? "OGG_OPUS" : "MP3";
        const targetMime = useOgg ? "audio/ogg; codecs=opus" : "audio/mpeg";
        const metaMime = useOgg ? "audio/ogg" : "audio/mpeg";
        const [tgtResp] = await client.synthesizeSpeech({
          input: { text: textChunk },
          voice: { name: voice, languageCode: lang },
          audioConfig: { audioEncoding: targetEncoding, speakingRate: speed, sampleRateHertz: 48000 },
        } as any);
        const tgtAudioContent = tgtResp.audioContent as Buffer | Uint8Array | string;
        const tgtBuf = Buffer.isBuffer(tgtAudioContent)
          ? tgtAudioContent
          : typeof tgtAudioContent === "string"
          ? Buffer.from(tgtAudioContent, "base64")
          : Buffer.from(tgtAudioContent);
        let tgtDurationMs = 0;
        if (includeDurations || effectivePreviewSec > 0) {
          try {
            const metaT = await mm.parseBuffer(tgtBuf, { mimeType: metaMime });
            tgtDurationMs = Math.round((metaT.format.duration || 0) * 1000);
          } catch {}
        }

        const count = c.endWord - c.startWord;
        // Build per-word times (monotonic), using scaled marks when available else uniform
        const per = count > 0 ? Math.floor((tgtDurationMs || 0) / count) : 0;
        let prev = offsetMs;
        for (let w = 0; w < count; w++) {
          const local = includeMarks && typeof scaledLocal[w] === 'number' ? scaledLocal[w] : w * per;
          const tGlobal = Math.max(prev + 1, offsetMs + local);
          if (includeMarks) allTimepoints.push({ wordIndex: c.startWord + w, tMs: tGlobal });
          prev = tGlobal;
        }

        const chunkDur = Math.max(tgtDurationMs, (prev - offsetMs) + 200);
        segments.push({ idx: i, audioBase64: tgtBuf.toString("base64"), durationMs: chunkDur, startWordIndex: c.startWord, mime: targetMime });
        if (DEBUG_TTS) console.log("[TTS] chunk %d: refDur=%dms tgtDur=%dms chunkDur=%dms marks=%d", i, refDurationMs, tgtDurationMs, chunkDur, count);
        offsetMs += chunkDur;
        if (effectivePreviewSec > 0 && offsetMs >= effectivePreviewSec * 1000) break;
      } else {
        // Non-Chirp voices: regular SSML marks on target voice
        const useOgg = container === "ogg";
        const targetEncoding = useOgg ? "OGG_OPUS" : "MP3";
        const targetMime = useOgg ? "audio/ogg; codecs=opus" : "audio/mpeg";
        const metaMime = useOgg ? "audio/ogg" : "audio/mpeg";
        const [response] = await client.synthesizeSpeech({
          input: { ssml: c.ssml },
          voice: { name: voice, languageCode: lang },
          audioConfig: { audioEncoding: targetEncoding, speakingRate: speed, sampleRateHertz: 48000 },
          enableTimePointing: ["SSML_MARK"],
        } as any);

        const audioContent = response.audioContent as Buffer | Uint8Array | string;
        let localTimes: number[] = [];
        if (includeMarks) {
          const timepointsRaw = (((response as any).timepoints) || []) as { markName: string; timeSeconds: number }[];
          localTimes = timepointsRaw.map((tp) => Math.round(Number(tp.timeSeconds) * 1000));
        }

        const audioBuf = Buffer.isBuffer(audioContent)
          ? audioContent
          : typeof audioContent === "string"
          ? Buffer.from(audioContent, "base64")
          : Buffer.from(audioContent);

        let durationMs = 0;
        if (includeDurations || effectivePreviewSec > 0) {
          try {
            const meta = await mm.parseBuffer(audioBuf, { mimeType: metaMime });
            durationMs = Math.round((meta.format.duration || 0) * 1000);
          } catch {}
        }

        const count = c.endWord - c.startWord;
        const per = count > 0 ? Math.floor((durationMs || 0) / count) : 0;
        let prev = offsetMs;
        for (let w = 0; w < count; w++) {
          const local = includeMarks && typeof localTimes[w] === 'number' ? localTimes[w] : w * per;
          const tGlobal = Math.max(prev + 1, offsetMs + local);
          if (includeMarks) allTimepoints.push({ wordIndex: c.startWord + w, tMs: tGlobal });
          prev = tGlobal;
        }

        if (durationMs === 0) durationMs = (prev - offsetMs) + 200;

        segments.push({ idx: i, audioBase64: audioBuf.toString("base64"), durationMs, startWordIndex: c.startWord, mime: targetMime });
        if (DEBUG_TTS) console.log("[TTS] chunk %d: duration=%dms marks=%d", i, durationMs, count);
        offsetMs += durationMs;
        if (effectivePreviewSec > 0 && offsetMs >= effectivePreviewSec * 1000) break;
      }
    }

    // Sort by time to ensure playback sync is monotonic
    allTimepoints.sort((a, b) => a.tMs - b.tMs);

    return NextResponse.json({
      segments,
      timepoints: includeMarks ? allTimepoints : [],
      totalWords,
      chunkStart: start,
      chunkEnd: endExclusive,
      totalChunks,
    });
  } catch (err: any) {
    console.error("TTS error", err);
    return NextResponse.json({ error: err?.message || "Internal error" }, { status: 500 });
  }
}

