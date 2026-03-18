import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title") || "ReadTo Blog";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "60px 64px",
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* Logo */}
        <div
          style={{
            position: "absolute",
            top: 52,
            left: 64,
            fontSize: 22,
            fontWeight: 700,
            color: "rgba(255,255,255,0.9)",
            display: "flex",
          }}
        >
          <span style={{ opacity: 0.5 }}>read</span>
          <span>to</span>
        </div>

        {/* Tag */}
        <div
          style={{
            display: "flex",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              background: "rgba(108,99,255,0.3)",
              border: "1px solid rgba(108,99,255,0.6)",
              borderRadius: 6,
              padding: "4px 14px",
              color: "#a89dff",
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: "0.05em",
              display: "flex",
            }}
          >
            BLOG
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: title.length > 60 ? 36 : 44,
            fontWeight: 800,
            color: "#fff",
            lineHeight: 1.2,
            marginBottom: 28,
            maxWidth: "90%",
            display: "flex",
          }}
        >
          {title}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            color: "rgba(255,255,255,0.5)",
            fontSize: 15,
          }}
        >
          <span>readto.app</span>
          <span>·</span>
          <span>Turn any text into audio</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
