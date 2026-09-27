// ============================================================
// TechieNicks — chatbot/build-embeddings.js
//
// Chunks each HTML page into smaller sections and calls the Gemini
// embedding API on each chunk, writing the result as NDJSON ready
// for Cloudflare Vectorize:
//
//     GEMINI_API_KEY=your-key node chatbot/build-embeddings.js
//
// Then upload the vectors:
//
//     First time only:
//         npx wrangler vectorize create techienicks-docs --dimensions=768 --metric=cosine
//         npx wrangler vectorize insert techienicks-docs --file=chatbot/functions/vectors.ndjson
//
//     Any time page content changes (re-run the build above first):
//         npx wrangler vectorize upsert techienicks-docs --file=chatbot/functions/vectors.ndjson
//
// Run this whenever you add or edit page content, same as
// build-site-content.js. No npm dependencies required — uses only
// Node's built-in modules (Node 18+ for global fetch).
// ============================================================

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUTPUT_PATH = path.join(__dirname, "functions", "vectors.ndjson");

const EMBED_MODEL = "gemini-embedding-001";
const OUTPUT_DIMENSIONALITY = 768; // must match the Vectorize index's --dimensions
const CHUNK_SIZE = 1000; // characters per chunk, roughly
const CHUNK_OVERLAP = 150; // characters shared between consecutive chunks
const REQUEST_DELAY_MS = 150; // spacing between embedding calls, to stay well under free-tier RPM

// Add or remove page paths here as the site grows — same list as build-site-content.js.
const PAGES = [
  "index.html",
  "about.html",
  "contact.html",
  "projects.html",
  "techspec.html",
  "pages/AtlassianJira.html",
  "pages/AtlassianOrg.html",
  "pages/Confluence.html",
  "pages/Git.html",
  "pages/Integrations.html",
  "pages/REST.html",
];

// ---------------------------------------------------------------
// HTML extraction — same approach as build-site-content.js, kept
// duplicated here so this script has no dependency on that file
// or its output.
// ---------------------------------------------------------------
function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/\s+/g, " ").trim() : "Untitled";
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, " ");
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// Splits a page into (anchor, text) sections using the same section/article/h1-4
// id markers build-site-content.js treats as navigable anchors, so each chunk
// can carry the nearest real anchor for deep-linking. Content before the first
// anchor gets anchor: null.
function extractAnchoredSections(html) {
  let body = html;
  body = body.replace(/<script[\s\S]*?<\/script>/gi, " ");
  body = body.replace(/<style[\s\S]*?<\/style>/gi, " ");
  body = body.replace(/<!--[\s\S]*?-->/g, " ");
  const bodyMatch = body.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) body = bodyMatch[1];

  const idPattern = /<(section|article|h[1-4])\b[^>]*\bid="([^"]+)"[^>]*>/gi;
  const markers = [];
  let match;
  while ((match = idPattern.exec(body)) !== null) {
    markers.push({ index: match.index, id: match[2] });
  }

  const sections = [];
  const boundaries = markers.map((m) => m.index).concat([body.length]);
  let start = 0;
  let currentAnchor = null;
  for (let i = 0; i <= markers.length; i++) {
    const end = boundaries[i];
    const raw = body.slice(start, end);
    const text = decodeEntities(stripTags(raw))
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (text) sections.push({ anchor: currentAnchor, text });
    if (i < markers.length) {
      currentAnchor = markers[i].id;
      start = markers[i].index;
    }
  }
  return sections;
}

// Splits a long section's text into ~CHUNK_SIZE-character pieces on paragraph
// or sentence boundaries where possible, with a small overlap for context
// continuity between adjacent chunks.
function splitIntoChunks(text) {
  if (text.length <= CHUNK_SIZE) return [text];

  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE, text.length);
    if (end < text.length) {
      const paragraphBreak = text.lastIndexOf("\n\n", end);
      const sentenceBreak = text.lastIndexOf(". ", end);
      const breakPoint = paragraphBreak > start + CHUNK_SIZE * 0.5
        ? paragraphBreak
        : sentenceBreak > start + CHUNK_SIZE * 0.5
          ? sentenceBreak + 1
          : end;
      end = breakPoint;
    }
    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }
  return chunks.filter(Boolean);
}

function slugify(relativePath) {
  return relativePath.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function buildPageChunks(relativePath) {
  const fullPath = path.join(ROOT, relativePath);
  const html = fs.readFileSync(fullPath, "utf8");
  const title = extractTitle(html);
  const sections = extractAnchoredSections(html);

  const chunks = [];
  let chunkIndex = 0;
  for (const section of sections) {
    for (const piece of splitIntoChunks(section.text)) {
      chunks.push({
        id: `${slugify(relativePath)}-${String(chunkIndex).padStart(4, "0")}`,
        page: relativePath,
        title,
        anchor: section.anchor,
        text: piece,
      });
      chunkIndex++;
    }
  }
  return chunks;
}

// ---------------------------------------------------------------
// Gemini embedding calls
// ---------------------------------------------------------------
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function embedChunk(apiKey, text, attempt = 1) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text }] },
      task_type: "RETRIEVAL_DOCUMENT",
      output_dimensionality: OUTPUT_DIMENSIONALITY,
    }),
  });

  if (res.status === 429 && attempt <= 3) {
    await sleep(2000 * attempt);
    return embedChunk(apiKey, text, attempt + 1);
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error((data && data.error && data.error.message) || `Embedding request failed (${res.status})`);
  }
  return data.embedding.values;
}

// ---------------------------------------------------------------
// Main
// ---------------------------------------------------------------
async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Set GEMINI_API_KEY before running this script, e.g.:\n  GEMINI_API_KEY=your-key node chatbot/build-embeddings.js");
    process.exit(1);
  }

  const allChunks = [];
  for (const page of PAGES) {
    try {
      const chunks = buildPageChunks(page);
      allChunks.push(...chunks);
      console.log(`✓ ${page}: ${chunks.length} chunk(s)`);
    } catch (err) {
      console.error(`✗ Skipped ${page}: ${err.message}`);
    }
  }

  console.log(`\nEmbedding ${allChunks.length} chunks with ${EMBED_MODEL}...`);
  const lines = [];
  for (let i = 0; i < allChunks.length; i++) {
    const chunk = allChunks[i];
    try {
      const values = await embedChunk(apiKey, chunk.text);
      lines.push(JSON.stringify({
        id: chunk.id,
        values,
        metadata: {
          page: chunk.page,
          title: chunk.title,
          anchor: chunk.anchor || "",
          text: chunk.text.slice(0, 1500),
        },
      }));
      process.stdout.write(`\r  ${i + 1}/${allChunks.length}`);
    } catch (err) {
      console.error(`\nFailed to embed chunk ${chunk.id}: ${err.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }
  console.log("");

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, lines.join("\n") + "\n", "utf8");
  console.log(`\nWrote ${OUTPUT_PATH} (${lines.length} vectors)`);
  console.log("\nNext: upload with wrangler —");
  console.log("  First time:   npx wrangler vectorize create techienicks-docs --dimensions=768 --metric=cosine");
  console.log("                npx wrangler vectorize insert techienicks-docs --file=chatbot/functions/vectors.ndjson");
  console.log("  After edits:  npx wrangler vectorize upsert techienicks-docs --file=chatbot/functions/vectors.ndjson");
}

if (require.main === module) {
  main();
} else {
  module.exports = { buildPageChunks, splitIntoChunks, extractAnchoredSections };
}
