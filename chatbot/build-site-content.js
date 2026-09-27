#!/usr/bin/env node
/**
 * build-site-content.js
 * --------------------------------------------------------------
 * Extracts readable text from every page on the site and writes
 * it to netlify/functions/site-content.txt — the file the chat
 * function loads as context so it can answer from your content.
 *
 * Run this after editing any page, before deploying:
 *   node scripts/build-site-content.js
 * --------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT_FILE = path.join(__dirname, "functions", "site-content.txt");

// Add/remove paths here as your site grows
const PAGE_GLOBS = [
  "index.html",
  "about.html",
  "contact.html",
  "projects.html",
  "techspec.html",
  "pages", // every .html file inside this folder is included automatically
];

function listHtmlFiles() {
  var files = [];
  PAGE_GLOBS.forEach(function (entry) {
    var full = path.join(ROOT, entry);
    if (!fs.existsSync(full)) return;
    var stat = fs.statSync(full);
    if (stat.isDirectory()) {
      fs.readdirSync(full)
        .filter(function (f) { return f.endsWith(".html") && !f.startsWith("_"); })
        .forEach(function (f) { files.push(path.join(entry, f)); });
    } else {
      files.push(entry);
    }
  });
  return files;
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

function extractAnchors(html) {
  var anchors = [];
  var matches = html.matchAll(/<h[1-6][^>]*id=["']([^"']+)["'][^>]*>([\s\S]*?)<\/h[1-6]>/gi);

  for (var match of matches) {
    if (!match[1] || !match[2]) continue;
    var label = stripHtml(match[2]).trim();
    if (label) anchors.push(match[1] + " | " + label);
  }

  return anchors;
}

function main() {
  var files = listHtmlFiles();
  var chunks = [];

  files.forEach(function (rel) {
    var full = path.join(ROOT, rel);
    var html = fs.readFileSync(full, "utf8");
    var titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    var title = titleMatch ? titleMatch[1].trim() : rel;
    var text = stripHtml(html);
    var anchors = extractAnchors(html);
    var anchorBlock = anchors.length ? "ANCHORS:\n" + anchors.join("\n") + "\n\n" : "ANCHORS:\nnone\n\n";
    chunks.push("=== PAGE: " + rel.replace(/\\/g, "/") + " ===\nTITLE: " + title + "\n\n" + anchorBlock + text + "\n");
  });

  var result = chunks.join("\n");
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, result, "utf8");
  console.log("Wrote " + OUT_FILE + " (" + result.length + " chars, " + files.length + " pages)");
}

main();
