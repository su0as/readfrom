import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import { getAllPosts, getPostBySlug, formatDate } from "@/lib/blog";

const BASE_URL = "https://www.readto.app";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};

  const ogImage = post.ogImage
    ? `${BASE_URL}${post.ogImage}`
    : `${BASE_URL}/api/blog/og?title=${encodeURIComponent(post.title)}`;

  return {
    title: `${post.title} — ReadTo Blog`,
    description: post.description,
    keywords: post.keywords,
    alternates: {
      canonical: `${BASE_URL}/blog/${post.slug}`,
    },
    openGraph: {
      title: post.title,
      description: post.description,
      url: `${BASE_URL}/blog/${post.slug}`,
      siteName: "ReadTo",
      type: "article",
      publishedTime: post.date,
      images: [{ url: ogImage, width: 1200, height: 630, alt: post.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      images: [ogImage],
    },
    other: {
      "article:published_time": post.date,
    },
  };
}

// MDX components — maps markdown elements to styled HTML
const components = {
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1
      style={{
        fontFamily: "var(--font-serif, Georgia, serif)",
        fontSize: "clamp(26px, 4vw, 36px)",
        fontWeight: 700,
        lineHeight: 1.2,
        marginBottom: 24,
        marginTop: 40,
      }}
      {...props}
    />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2
      style={{
        fontFamily: "var(--font-serif, Georgia, serif)",
        fontSize: "clamp(20px, 3vw, 26px)",
        fontWeight: 700,
        lineHeight: 1.3,
        marginBottom: 16,
        marginTop: 48,
        paddingTop: 8,
        borderTop: "1px solid var(--border, #e5e7eb)",
      }}
      {...props}
    />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3
      style={{
        fontSize: 18,
        fontWeight: 600,
        marginBottom: 12,
        marginTop: 32,
      }}
      {...props}
    />
  ),
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p
      style={{
        fontSize: 17,
        lineHeight: 1.75,
        marginBottom: 20,
        color: "var(--fg, #111)",
      }}
      {...props}
    />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul
      style={{
        paddingLeft: 24,
        marginBottom: 20,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
      {...props}
    />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol
      style={{
        paddingLeft: 24,
        marginBottom: 20,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
      {...props}
    />
  ),
  li: (props: React.HTMLAttributes<HTMLLIElement>) => (
    <li style={{ fontSize: 17, lineHeight: 1.7 }} {...props} />
  ),
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      style={{ color: "var(--accent, #6c63ff)", textDecoration: "underline" }}
      {...props}
    />
  ),
  strong: (props: React.HTMLAttributes<HTMLElement>) => (
    <strong style={{ fontWeight: 700 }} {...props} />
  ),
  blockquote: (props: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      style={{
        borderLeft: "3px solid var(--accent, #6c63ff)",
        paddingLeft: 20,
        margin: "24px 0",
        color: "var(--muted, #888)",
        fontStyle: "italic",
      }}
      {...props}
    />
  ),
  hr: () => (
    <hr
      style={{
        border: "none",
        borderTop: "1px solid var(--border, #e5e7eb)",
        margin: "40px 0",
      }}
    />
  ),
  table: (props: React.HTMLAttributes<HTMLTableElement>) => (
    <div style={{ overflowX: "auto", marginBottom: 24 }}>
      <table
        style={{
          borderCollapse: "collapse",
          width: "100%",
          fontSize: 15,
        }}
        {...props}
      />
    </div>
  ),
  th: (props: React.HTMLAttributes<HTMLTableCellElement>) => (
    <th
      style={{
        borderBottom: "2px solid var(--border, #e5e7eb)",
        padding: "10px 16px",
        textAlign: "left",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
      {...props}
    />
  ),
  td: (props: React.HTMLAttributes<HTMLTableCellElement>) => (
    <td
      style={{
        borderBottom: "1px solid var(--border, #e5e7eb)",
        padding: "10px 16px",
      }}
      {...props}
    />
  ),
  code: (props: React.HTMLAttributes<HTMLElement>) => (
    <code
      style={{
        background: "var(--surface, #f5f5f5)",
        padding: "2px 6px",
        borderRadius: 4,
        fontSize: "0.9em",
        fontFamily: "monospace",
      }}
      {...props}
    />
  ),
  pre: (props: React.HTMLAttributes<HTMLPreElement>) => (
    <pre
      style={{
        background: "var(--surface, #f5f5f5)",
        padding: "16px 20px",
        borderRadius: 8,
        overflowX: "auto",
        marginBottom: 20,
        fontSize: 14,
      }}
      {...props}
    />
  ),
};

// Sticky "Try ReadTo" CTA shown at bottom of every post
function TryReadToCTA() {
  return (
    <div
      style={{
        background: "var(--accent, #6c63ff)",
        color: "#fff",
        borderRadius: 12,
        padding: "32px 28px",
        marginTop: 56,
        marginBottom: 24,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-serif, Georgia, serif)",
          fontSize: 22,
          fontWeight: 700,
          marginBottom: 10,
        }}
      >
        Turn any text into audio — free
      </div>
      <p
        style={{
          fontSize: 15,
          opacity: 0.9,
          marginBottom: 20,
          lineHeight: 1.6,
        }}
      >
        Paste text, paste a URL, or upload a PDF. Natural AI voices with
        word-by-word highlighting. No signup needed for the first 60 seconds.
      </p>
      <a
        href="https://www.readto.app"
        style={{
          display: "inline-block",
          background: "#fff",
          color: "var(--accent, #6c63ff)",
          fontWeight: 700,
          fontSize: 15,
          padding: "12px 28px",
          borderRadius: 8,
          textDecoration: "none",
        }}
      >
        Try ReadTo free →
      </a>
    </div>
  );
}

export default async function BlogPost({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: {
      "@type": "Organization",
      name: "ReadTo",
      url: BASE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "ReadTo",
      url: BASE_URL,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${BASE_URL}/blog/${post.slug}`,
    },
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg, #fff)",
        color: "var(--fg, #111)",
        fontFamily: "var(--font-ui, sans-serif)",
      }}
    >
      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

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
          href="/blog"
          style={{
            fontSize: 13,
            color: "var(--muted, #888)",
            textDecoration: "none",
          }}
        >
          ← All articles
        </Link>
      </header>

      {/* Article */}
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 80px" }}>
        {/* Meta */}
        <div
          style={{
            fontSize: 13,
            color: "var(--muted, #888)",
            marginBottom: 16,
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span>{formatDate(post.date)}</span>
          <span>·</span>
          <span>{post.readingTime} min read</span>
        </div>

        {/* Title */}
        <h1
          style={{
            fontFamily: "var(--font-serif, Georgia, serif)",
            fontSize: "clamp(26px, 5vw, 40px)",
            fontWeight: 700,
            lineHeight: 1.2,
            marginBottom: 20,
          }}
        >
          {post.title}
        </h1>

        {/* Description lead */}
        <p
          style={{
            fontSize: 18,
            lineHeight: 1.65,
            color: "var(--muted, #555)",
            marginBottom: 40,
            borderBottom: "1px solid var(--border, #e5e7eb)",
            paddingBottom: 32,
          }}
        >
          {post.description}
        </p>

        {/* MDX content */}
        <MDXRemote
          source={post.content}
          components={components}
          options={{
            mdxOptions: {
              remarkPlugins: [remarkGfm],
              rehypePlugins: [rehypeSlug, rehypeAutolinkHeadings],
            },
          }}
        />

        {/* CTA */}
        <TryReadToCTA />

        {/* Back link */}
        <div style={{ marginTop: 32, textAlign: "center" }}>
          <Link
            href="/blog"
            style={{
              fontSize: 14,
              color: "var(--muted, #888)",
              textDecoration: "none",
            }}
          >
            ← Back to all articles
          </Link>
        </div>
      </main>
    </div>
  );
}
