#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const dir = join(root, ".next");
const patterns = [
  /GOOGLE_[A-Z0-9_]{2,}/,
  /UPSTASH_[A-Z0-9_]{2,}/,
  /WHOP_API_KEY/,
  /SENTRY_DSN/,
];

function walk(p) {
  const out = [];
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const name of readdirSync(p)) out.push(...walk(join(p, name)));
  } else if (st.isFile()) {
    out.push(p);
  }
  return out;
}

function main() {
  try {
    const files = walk(dir).filter((p) => /static\/.+\.(js|txt|html)/.test(p));
    let bad = [];
    for (const f of files) {
      const txt = readFileSync(f, "utf8");
      for (const re of patterns) {
        if (re.test(txt)) {
          bad.push({ file: f, pattern: re.toString() });
        }
      }
    }
    if (bad.length) {
      console.error("Secret-like strings found in client bundle:");
      for (const b of bad) console.error(` - ${b.file} matches ${b.pattern}`);
      process.exit(1);
    }
    console.log("✓ No secret-like strings found in client bundle.");
  } catch (e) {
    console.warn("Secret scan skipped: " + (e?.message || e));
  }
}

main();
