/**
 * Client-side EPUB parser using JSZip.
 * An EPUB file is a ZIP archive containing XHTML chapters.
 */
export async function parseEpub(file: File): Promise<{ title: string; text: string }> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  // Read META-INF/container.xml to find the OPF root file
  const containerXml = await zip.file("META-INF/container.xml")?.async("text");
  if (!containerXml) throw new Error("Invalid EPUB: missing container.xml");

  const opfPathMatch = containerXml.match(/full-path="([^"]+\.opf)"/i);
  if (!opfPathMatch) throw new Error("Invalid EPUB: cannot find OPF path");
  const opfPath = opfPathMatch[1];

  const opfContent = await zip.file(opfPath)?.async("text");
  if (!opfContent) throw new Error("Invalid EPUB: cannot read OPF");

  // Extract book title
  const titleMatch = opfContent.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
  const title = titleMatch?.[1]?.trim() || file.name.replace(/\.epub$/i, "");

  // Build manifest: id -> href
  const manifest = new Map<string, string>();
  for (const m of opfContent.matchAll(/<item[^>]+id="([^"]+)"[^>]+href="([^"]+)"/gi)) {
    manifest.set(m[1], m[2]);
  }

  // Build spine: ordered list of idref values
  const spineItems: string[] = [];
  for (const m of opfContent.matchAll(/idref="([^"]+)"/gi)) {
    spineItems.push(m[1]);
  }

  // Determine base path for relative hrefs
  const basePath = opfPath.includes("/")
    ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1)
    : "";

  // Read each chapter in spine order
  let fullText = "";
  for (const itemId of spineItems) {
    const href = manifest.get(itemId);
    if (!href) continue;
    const filePath = href.startsWith("/") ? href.slice(1) : basePath + href;
    const content = await zip.file(filePath)?.async("text").catch(() => null);
    if (!content) continue;

    const chapterText = content
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+/g, " ")
      .trim();

    if (chapterText.length > 20) {
      fullText += chapterText + "\n\n";
    }
  }

  const text = fullText.replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw new Error("Could not extract text from EPUB");

  return { title, text };
}
