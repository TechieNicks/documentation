// ============================================================
// TechieNicks — chatbot/build-site-content.js
// Regenerates chatbot/functions/site-content.txt from the site's
// HTML pages. Run this any time you add or edit page content:
//
//     node chatbot/build-site-content.js
//
// Then commit the updated chatbot/functions/site-content.txt file.
// No dependencies required — uses only Node's built-in modules.
// ============================================================

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUTPUT_PATH = path.join(__dirname, "functions", "site-content.txt");

// Add or remove page paths here as the site grows.
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

function extractAnchors(html) {
  const anchors = [];
  const seen = new Set();
  // Only section/article wrappers and headings carry meaningful chapter anchors;
  // nav/video/button ids are UI hooks, not navigable content.
  const idPattern = /<(section|article|h[1-4])\b[^>]*\bid="([^"]+)"[^>]*>/gi;
  let match;
  while ((match = idPattern.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const id = match[2];
    if (seen.has(id)) continue;
    seen.add(id);

    let label;
    if (tag.startsWith("h")) {
      const closeIdx = html.indexOf(`</${tag}>`, match.index);
      label = decodeEntities(stripTags(html.slice(match.index, closeIdx)).replace(/\s+/g, " ").trim());
    } else {
      // section/article: use the first heading found inside it as the label.
      const nextSectionIdx = html.indexOf("<section", match.index + 10);
      const searchEnd = nextSectionIdx === -1 ? match.index + 4000 : nextSectionIdx;
      const windowText = html.slice(match.index, searchEnd);
      const headingMatch = windowText.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i);
      label = headingMatch
        ? decodeEntities(stripTags(headingMatch[1]).replace(/\s+/g, " ").trim())
        : id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
    anchors.push(`${id} | ${label}`);
  }
  return anchors;
}

function extractBodyText(html) {
  let body = html;
  // Drop script/style blocks and HTML comments entirely.
  body = body.replace(/<script[\s\S]*?<\/script>/gi, " ");
  body = body.replace(/<style[\s\S]*?<\/style>/gi, " ");
  body = body.replace(/<!--[\s\S]*?-->/g, " ");
  // Keep only the <body> contents if present.
  const bodyMatch = body.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) body = bodyMatch[1];

  body = decodeEntities(stripTags(body));

  // Collapse excess blank lines/spaces while keeping paragraph breaks readable.
  body = body
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return body;
}

function buildPageBlock(relativePath) {
  const fullPath = path.join(ROOT, relativePath);
  const html = fs.readFileSync(fullPath, "utf8");

  const title = extractTitle(html);
  const anchors = extractAnchors(html);
  const bodyText = extractBodyText(html);

  const anchorsBlock = anchors.length ? anchors.join("\n") : "none";

  return `=== PAGE: ${relativePath} ===\nTITLE: ${title}\n\nANCHORS:\n${anchorsBlock}\n\n${bodyText}`;
}

function main() {
  const blocks = [];
  for (const page of PAGES) {
    try {
      blocks.push(buildPageBlock(page));
      console.log(`✓ Processed ${page}`);
    } catch (err) {
      console.error(`✗ Skipped ${page}: ${err.message}`);
    }
  }

  const output = blocks.join("\n\n");
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, output, "utf8");
  console.log(`\nWrote ${OUTPUT_PATH} (${output.length} characters)`);
}

main();