/* Synthesize audio for a stored spec and return a single file by concatenating segments. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { storeGet } from '@/utils/blobStore';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id') || '';
    const container = (searchParams.get('container') === 'ogg' ? 'ogg' : 'mp3') as 'mp3' | 'ogg';
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const specRaw = await storeGet(`rf:spec:${id}`);
    if (!specRaw) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const spec = JSON.parse(specRaw) as { text: string; voice: string; speed: number; container: 'mp3' | 'ogg' };

    // Call our TTS route in audio format to get segments
    const r = await fetch(`${req.nextUrl.origin}/api/tts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: spec.text, voice: spec.voice, speed: spec.speed, format: 'audio', container })
    });
    if (!r.ok) return NextResponse.json({ error: 'TTS failed' }, { status: 500 });
    const j = await r.json();
    const segs = (j.segments || []) as { audioBase64: string; mime?: string }[];
    if (!segs.length) return NextResponse.json({ error: 'No audio' }, { status: 500 });

    // Concatenate buffers naïvely (works for most MP3/OGG players; for perfection use a muxer)
    const bufs = segs.map((s) => Buffer.from(s.audioBase64, 'base64'));
    const full = Buffer.concat(bufs);
    const mime = container === 'ogg' ? 'audio/ogg; codecs=opus' : 'audio/mpeg';

    return new NextResponse(full, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(full.byteLength),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Disposition': `inline; filename="readto.${container === 'ogg' ? 'ogg' : 'mp3'}"`,
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Download failed' }, { status: 500 });
  }
}

