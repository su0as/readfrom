import fs from "fs";
import path from "path";
import matter from "gray-matter";

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

export interface PostMeta {
  slug: string;
  title: string;
  description: string;
  date: string;
  keywords: string[];
  readingTime: number;
  ogImage?: string;
}

export interface Post extends PostMeta {
  content: string;
}

function getSlugFromFilename(filename: string): string {
  return filename.replace(/\.mdx?$/, "");
}

export function getAllPosts(): PostMeta[] {
  if (!fs.existsSync(BLOG_DIR)) return [];

  const files = fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".mdx") || f.endsWith(".md"));

  const posts = files
    .map((filename) => {
      const slug = getSlugFromFilename(filename);
      const raw = fs.readFileSync(path.join(BLOG_DIR, filename), "utf-8");
      const { data } = matter(raw);
      return {
        slug: (data.slug as string) || slug,
        title: (data.title as string) || slug,
        description: (data.description as string) || "",
        date: (data.date as string) || "",
        keywords: (data.keywords as string[]) || [],
        readingTime: Number(data.readingTime) || 5,
        ogImage: data.ogImage as string | undefined,
      } satisfies PostMeta;
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return posts;
}

export function getPostBySlug(slug: string): Post | null {
  if (!fs.existsSync(BLOG_DIR)) return null;

  const files = fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".mdx") || f.endsWith(".md"));

  for (const filename of files) {
    const raw = fs.readFileSync(path.join(BLOG_DIR, filename), "utf-8");
    const { data, content } = matter(raw);
    const fileSlug = (data.slug as string) || getSlugFromFilename(filename);
    if (fileSlug === slug) {
      return {
        slug: fileSlug,
        title: (data.title as string) || slug,
        description: (data.description as string) || "",
        date: (data.date as string) || "",
        keywords: (data.keywords as string[]) || [],
        readingTime: Number(data.readingTime) || 5,
        ogImage: data.ogImage as string | undefined,
        content,
      };
    }
  }

  return null;
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
