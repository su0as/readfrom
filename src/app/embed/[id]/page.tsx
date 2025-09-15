import { storeGet } from "@/utils/blobStore";
import { notFound } from "next/navigation";
import React from "react";

export const dynamic = "force-dynamic";

// Next.js 15 PageProps defines `params` as a Promise for dynamic routes
export default async function EmbedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const specRaw = await storeGet(`rf:spec:${id}`);
  if (!specRaw) return notFound();
  const spec = JSON.parse(specRaw) as {
    text: string;
    voice: string;
    speed: number;
    container: "mp3" | "ogg";
  };

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, sans-serif",
          background: "#fff",
          color: "#111",
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: 8, padding: 8 }}
        >
          <button
            id="play"
            style={{
              padding: "8px 12px",
              border: "1px solid #ddd",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Play
          </button>
          <div style={{ fontSize: 14, opacity: 0.8 }}>ReadFrom player</div>
        </div>
        <audio id="aud" preload="none" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
          (function(){
            const btn = document.getElementById('play');
            const aud = document.getElementById('aud');
            const spec = ${JSON.stringify(spec)};
            btn.addEventListener('click', async () => {
              btn.disabled = true; btn.textContent = 'Loading…';
              try {
                const r = await fetch('/api/tts', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text: spec.text, voice: spec.voice, speed: spec.speed, format: 'audio', container: 'mp3' }) });
                const j = await r.json();
                const seg = (j.segments && j.segments[0]) || null;
                if (!seg) { btn.textContent = 'Error'; return; }
                aud.src = 'data:' + (seg.mime || 'audio/mpeg') + ';base64,' + seg.audioBase64;
                await aud.play();
                btn.textContent = 'Playing…';
              } catch { btn.textContent = 'Error'; }
            });
          })();
        `,
          }}
        />
      </body>
    </html>
  );
}
