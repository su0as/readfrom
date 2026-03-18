import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts, formatDate } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog — ReadTo",
  description:
    "Tips, comparisons, and guides on text-to-speech, listening productivity, and getting more from ReadTo.",
  alternates: {
    canonical: "https://www.readto.app/blog",
  },
  openGraph: {
    title: "Blog — ReadTo",
    description:
      "Tips, comparisons, and guides on text-to-speech, listening productivity, and getting more from ReadTo.",
    url: "https://www.readto.app/blog",
    siteName: "ReadTo",
    type: "website",
  },
};

export default function BlogIndex() {
  const posts = getAllPosts();

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg, #fff)",
        color: "var(--fg, #111)",
        fontFamily: "var(--font-ui, sans-serif)",
      }}
    >
      {/* Nav */}
      <header
        style={{
          borderBottom: "1px solid var(--border, #e5e7eb)",
          padding: "0 24px",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          background: "var(--bg, #fff)",
          zIndex: 10,
        }}
      >
        <Link
          href="/"
          style={{
            fontFamily: "var(--font-serif, Georgia, serif)",
            fontWeight: 700,
            fontSize: 18,
            color: "var(--fg, #111)",
            textDecoration: "none",
          }}
        >
          <span style={{ opacity: 0.5 }}>read</span>to
        </Link>
        <Link
          href="/"
          style={{
            fontSize: 13,
            color: "var(--muted, #888)",
            textDecoration: "none",
          }}
        >
          ← Back to app
        </Link>
      </header>

      {/* Hero */}
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "64px 24px 40px",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-serif, Georgia, serif)",
            fontSize: "clamp(28px, 5vw, 42px)",
            fontWeight: 700,
            marginBottom: 12,
            lineHeight: 1.2,
          }}
        >
          Blog
        </h1>
        <p style={{ fontSize: 16, color: "var(--muted, #888)", margin: 0 }}>
          Guides, comparisons, and tips on listening smarter.
        </p>
      </div>

      {/* Post list */}
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "0 24px 80px" }}>
        {posts.length === 0 ? (
          <p style={{ color: "var(--muted, #888)", fontSize: 15 }}>
            No posts yet. Check back soon.
          </p>
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: 0 }}
          >
            {posts.map((post, i) => (
              <article
                key={post.slug}
                style={{
                  borderTop:
                    i === 0
                      ? "1px solid var(--border, #e5e7eb)"
                      : undefined,
                  borderBottom: "1px solid var(--border, #e5e7eb)",
                  padding: "28px 0",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--muted, #888)",
                    marginBottom: 8,
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <span>{formatDate(post.date)}</span>
                  <span>·</span>
                  <span>{post.readingTime} min read</span>
                </div>
                <h2
                  style={{
                    fontFamily: "var(--font-serif, Georgia, serif)",
                    fontSize: "clamp(18px, 3vw, 22px)",
                    fontWeight: 700,
                    marginBottom: 8,
                    lineHeight: 1.3,
                  }}
                >
                  <Link
                    href={`/blog/${post.slug}`}
                    style={{
                      color: "var(--fg, #111)",
                      textDecoration: "none",
                    }}
                  >
                    {post.title}
                  </Link>
                </h2>
                <p
                  style={{
                    fontSize: 15,
                    color: "var(--muted, #888)",
                    lineHeight: 1.6,
                    marginBottom: 12,
                  }}
                >
                  {post.description}
                </p>
                <Link
                  href={`/blog/${post.slug}`}
                  style={{
                    fontSize: 13,
                    color: "var(--accent, #6c63ff)",
                    textDecoration: "none",
                    fontWeight: 500,
                  }}
                >
                  Read article →
                </Link>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
