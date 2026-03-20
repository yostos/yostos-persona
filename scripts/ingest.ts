import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { parse as parseToml } from "smol-toml";
// Inline types to avoid importing Workers-specific types
interface ArticleMeta {
  slug: string;
  title: string;
  section: string;
  url: string;
  date: string;
  tags: string[];
}

interface ManifestEntry {
  hash: string;
  last_processed: string;
  chunk_count: number;
}

interface Manifest {
  articles: Record<string, ManifestEntry>;
}

// --- Configuration ---
const CONTENT_DIR = path.resolve(__dirname, "../content");
const MANIFEST_PATH = path.resolve(__dirname, "manifest.json");
const SCAN_DIRS = ["blog", "about", "music", "projects"];

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const VECTORIZE_INDEX = "yostos-persona";

const DRY_RUN = process.argv.includes("--dry-run");

// --- Types ---
interface FrontMatter {
  title?: string;
  description?: string;
  date?: string;
  taxonomies?: { tags?: string[] };
  extra?: Record<string, unknown>;
}

interface ParsedArticle {
  slug: string;
  frontMatter: FrontMatter;
  body: string;
  filePath: string;
  section: string;
}

// --- Front matter parsing ---
function parseFrontMatter(content: string): { frontMatter: FrontMatter; body: string } {
  const match = content.match(/^\+\+\+\s*\n([\s\S]*?)\n\+\+\+\s*\n([\s\S]*)$/);
  if (!match) {
    return { frontMatter: {}, body: content };
  }
  const tomlStr = match[1];
  const body = match[2];
  const frontMatter = parseToml(tomlStr) as unknown as FrontMatter;
  return { frontMatter, body };
}

// --- Slug extraction ---
function extractSlug(filePath: string): string {
  const dir = path.dirname(filePath);
  return path.basename(dir);
}

function extractSection(filePath: string): string {
  const rel = path.relative(CONTENT_DIR, filePath);
  const parts = rel.split(path.sep);
  return parts[0]; // blog, about, music, projects
}

// --- Text cleaning ---
function cleanText(text: string): string {
  // Remove Zola shortcodes: {% ... %} and {{ ... }}
  let cleaned = text.replace(/\{%[\s\S]*?%\}/g, "");
  cleaned = cleaned.replace(/\{\{[\s\S]*?\}\}/g, "");
  // Remove HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, "");
  // Remove HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");
  // Remove Markdown link references (but keep inline links text)
  cleaned = cleaned.replace(/^\[.*?\]:\s+.*$/gm, "");
  // Normalize whitespace
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

// --- Chunking ---
function chunkByHeading(body: string, slug: string, frontMatter: FrontMatter, section: string, filePath: string): { id: string; text: string; meta: ArticleMeta }[] {
  const cleaned = cleanText(body);
  const chunks: { id: string; text: string; meta: ArticleMeta }[] = [];

  const title = frontMatter.title || slug;
  const date = frontMatter.date ? String(frontMatter.date) : "";
  const tags = frontMatter.taxonomies?.tags || [];

  // Determine the URL based on section
  let url: string;
  if (section === "blog") {
    // Extract YYYY/MM from file path (content/blog/YYYY/MM/slug/index.md)
    const rel = path.relative(CONTENT_DIR, filePath);
    const parts = rel.split(path.sep);
    const datePath = parts.length >= 4 ? `${parts[1]}/${parts[2]}/` : "";
    url = `https://codedchords.dev/blog/${datePath}${slug}/`;
  } else if (section === "about") {
    url = `https://codedchords.dev/about/`;
  } else if (section === "music") {
    url = `https://codedchords.dev/music/`;
  } else {
    url = `https://codedchords.dev/${section}/${slug}/`;
  }

  // Split by ## headings
  const sections = cleaned.split(/^(?=## )/m);
  let sectionIndex = 0;

  for (const sec of sections) {
    const trimmed = sec.trim();
    if (!trimmed) continue;

    // Extract section heading
    const headingMatch = trimmed.match(/^## (.+)/);
    const sectionName = headingMatch ? headingMatch[1].trim() : "intro";
    const sectionText = headingMatch ? trimmed.replace(/^## .+\n?/, "").trim() : trimmed;

    if (!sectionText || sectionText.length < 20) {
      // Too short, skip or combine with title/description
      if (sectionIndex === 0 && frontMatter.description) {
        chunks.push({
          id: `${slug}::${sectionIndex}`,
          text: `${title}\n\n${frontMatter.description}\n\n${sectionText}`,
          meta: { slug, title, section: sectionName, url, date, tags },
        });
        sectionIndex++;
      }
      continue;
    }

    chunks.push({
      id: `${slug}::${sectionIndex}`,
      text: `${title} - ${sectionName}\n\n${sectionText}`,
      meta: { slug, title, section: sectionName, url, date, tags },
    });
    sectionIndex++;
  }

  // If no chunks produced, create one from title + description
  if (chunks.length === 0 && (frontMatter.title || frontMatter.description)) {
    chunks.push({
      id: `${slug}::0`,
      text: `${title}\n\n${frontMatter.description || ""}`,
      meta: { slug, title, section: "summary", url, date, tags },
    });
  }

  return chunks;
}

// --- File discovery ---
function discoverArticles(): ParsedArticle[] {
  const articles: ParsedArticle[] = [];

  for (const dir of SCAN_DIRS) {
    const dirPath = path.join(CONTENT_DIR, dir);
    if (!fs.existsSync(dirPath)) continue;
    walkDir(dirPath, (filePath) => {
      if (!filePath.endsWith(".md") || filePath.endsWith("_index.md")) return;
      const content = fs.readFileSync(filePath, "utf-8");
      const { frontMatter, body } = parseFrontMatter(content);

      // For non-index files like about.md, music.md
      const slug = path.basename(filePath) === "index.md"
        ? extractSlug(filePath)
        : path.basename(filePath, ".md");
      const section = extractSection(filePath);

      articles.push({ slug, frontMatter, body, filePath, section });
    });
  }

  return articles;
}

function walkDir(dir: string, callback: (filePath: string) => void): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, callback);
    } else {
      callback(fullPath);
    }
  }
}

// --- Cloudflare API helpers ---
async function embedTexts(texts: string[]): Promise<number[][]> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/@cf/baai/bge-m3`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: texts }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding API error: ${res.status} ${err}`);
  }
  const json = (await res.json()) as { result: { data: number[][] } };
  return json.result.data;
}

async function upsertVectors(
  vectors: { id: string; values: number[]; metadata: Record<string, string> }[]
): Promise<void> {
  // Vectorize REST API uses NDJSON format
  const ndjson = vectors.map((v) => JSON.stringify(v)).join("\n");
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/vectorize/v2/indexes/${VECTORIZE_INDEX}/upsert`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        "Content-Type": "application/x-ndjson",
      },
      body: ndjson,
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vectorize upsert error: ${res.status} ${err}`);
  }
}

async function deleteVectorsByIds(ids: string[]): Promise<void> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/vectorize/v2/indexes/${VECTORIZE_INDEX}/delete_by_ids`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vectorize delete error: ${res.status} ${err}`);
  }
}

// --- Main ---
async function main() {
  console.log(DRY_RUN ? "=== DRY RUN ===" : "=== Ingest Start ===");

  // Load manifest
  const manifest: Manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));

  // Discover articles
  const articles = discoverArticles();
  console.log(`Found ${articles.length} articles`);

  // Determine which articles need processing
  const toProcess: ParsedArticle[] = [];
  const currentSlugs = new Set<string>();

  for (const article of articles) {
    currentSlugs.add(article.slug);
    const contentHash = crypto.createHash("md5").update(article.body).digest("hex");
    const existing = manifest.articles[article.slug];

    if (!existing || existing.hash !== contentHash) {
      toProcess.push(article);
    }
  }

  // Detect deleted articles
  const deletedSlugs = Object.keys(manifest.articles).filter((s) => !currentSlugs.has(s));

  console.log(`To process: ${toProcess.length}, Deleted: ${deletedSlugs.length}`);

  if (DRY_RUN) {
    // Show chunks for each article
    for (const article of toProcess) {
      const chunks = chunkByHeading(article.body, article.slug, article.frontMatter, article.section, article.filePath);
      console.log(`\n--- ${article.slug} (${chunks.length} chunks) ---`);
      for (const chunk of chunks) {
        console.log(`  [${chunk.id}] ${chunk.meta.section} (${chunk.text.length} chars)`);
        console.log(`    ${chunk.text.substring(0, 100)}...`);
      }
    }
    for (const slug of deletedSlugs) {
      console.log(`\nWould delete: ${slug} (${manifest.articles[slug].chunk_count} chunks)`);
    }
    return;
  }

  // Validate credentials
  if (!ACCOUNT_ID || !API_TOKEN) {
    console.error("Error: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set");
    process.exit(1);
  }

  // Delete vectors for removed articles
  for (const slug of deletedSlugs) {
    const entry = manifest.articles[slug];
    const ids = Array.from({ length: entry.chunk_count }, (_, i) => `${slug}::${i}`);
    console.log(`Deleting ${ids.length} vectors for ${slug}`);
    await deleteVectorsByIds(ids);
    delete manifest.articles[slug];
  }

  // Process changed/new articles
  const BATCH_SIZE = 10; // embed up to 10 texts at a time
  for (const article of toProcess) {
    const chunks = chunkByHeading(article.body, article.slug, article.frontMatter, article.section, article.filePath);
    if (chunks.length === 0) {
      console.log(`Skipping ${article.slug}: no chunks`);
      continue;
    }

    console.log(`Processing ${article.slug}: ${chunks.length} chunks`);

    // Delete old vectors if exists
    const existing = manifest.articles[article.slug];
    if (existing) {
      const oldIds = Array.from({ length: existing.chunk_count }, (_, i) => `${article.slug}::${i}`);
      await deleteVectorsByIds(oldIds);
    }

    // Embed and upsert in batches
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const texts = batch.map((c) => c.text);
      const embeddings = await embedTexts(texts);

      const vectors = batch.map((c, j) => {
        // Vectorize metadata limit is 10240 bytes; truncate text to fit
        const MAX_TEXT_BYTES = 8000;
        let text = c.text;
        while (Buffer.byteLength(text, "utf-8") > MAX_TEXT_BYTES) {
          text = text.slice(0, -100);
        }
        return {
          id: c.id,
          values: embeddings[j],
          metadata: {
            text,
            slug: c.meta.slug,
            title: c.meta.title,
            section: c.meta.section,
            url: c.meta.url,
          },
        };
      });

      await upsertVectors(vectors);
    }

    // Update manifest
    const contentHash = crypto.createHash("md5").update(article.body).digest("hex");
    manifest.articles[article.slug] = {
      hash: contentHash,
      last_processed: new Date().toISOString(),
      chunk_count: chunks.length,
    };
  }

  // Save manifest
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log("=== Ingest Complete ===");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
