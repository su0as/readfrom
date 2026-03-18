import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { limitByIP } from "@/utils/rateLimit";
import { isSameOrigin } from "@/utils/origin";

export const runtime = "nodejs";

const RequestSchema = z.object({
  url: z.string().url(),
});

// Tags whose content should be removed entirely
const REMOVE_TAGS = [
  "script",
  "style",
  "noscript",
  "nav",
  "header",
  "footer",
  "aside",
  "iframe",
  "form",
  "button",
  "figure",
  "figcaption",
  "svg",
  "picture",
];

function extractText(html: string): { title: string; text: string } {
  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/&[a-z]+;/gi, " ").trim() : "";

  // Remove entire blocks we don't want
  let body = html;
  for (const tag of REMOVE_TAGS) {
    body = body.replace(new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, "gi"), " ");
  }

  // Try to focus on main content areas
  const mainMatch = body.match(/<(?:main|article)[^>]*>([\s\S]*?)<\/(?:main|article)>/i);
  if (mainMatch) body = mainMatch[1];

  // Replace block-level tags with newlines
  body = body.replace(/<\/(?:p|div|h[1-6]|li|blockquote|br)[^>]*>/gi, "\n");
  body = body.replace(/<br\s*\/?>/gi, "\n");

  // Strip remaining HTML tags
  body = body.replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  body = body
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/gi, (_, n) => String.fromCharCode(Number(n)));

  // Normalize whitespace: collapse spaces, then normalize line breaks
  body = body.replace(/[ \t]+/g, " ");
  body = body.replace(/\n{3,}/g, "\n\n");
  body = body.trim();

  // Filter out very short lines (likely navigation debris)
  const lines = body.split("\n");
  const filtered = lines.filter((l) => {
    const s = l.trim();
    return s.length > 20 || s === "";
  });
  const text = filtered.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  return { title, text };
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { success } = await limitByIP(req, 20, 60);
  if (!success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const { url } = parsed.data;

  // Only allow http/https
  const parsed_url = new URL(url);
  if (!["http:", "https:"].includes(parsed_url.protocol)) {
    return NextResponse.json({ error: "Invalid URL protocol" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ReadTo/1.0; +https://readto.app)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL (${response.status})` },
        { status: 422 },
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return NextResponse.json(
        { error: "URL does not point to an HTML page" },
        { status: 422 },
      );
    }

    // Limit response size to 2MB
    const reader = response.body?.getReader();
    if (!reader) {
      return NextResponse.json({ error: "Could not read response" }, { status: 422 });
    }
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    const MAX_BYTES = 2 * 1024 * 1024;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalBytes += value.length;
      if (totalBytes > MAX_BYTES) break;
    }
    const html = new TextDecoder().decode(
      Buffer.concat(chunks.map((c) => Buffer.from(c))),
    );

    const { title, text } = extractText(html);

    if (!text || text.length < 100) {
      return NextResponse.json(
        { error: "Could not extract enough text from this page" },
        { status: 422 },
      );
    }

    return NextResponse.json({ title, text, url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch URL";
    if (message.includes("abort")) {
      return NextResponse.json({ error: "Request timed out" }, { status: 408 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
