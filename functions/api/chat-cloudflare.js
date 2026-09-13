// functions/api/chat.js
// --------------------------------------------------------------
// Cloudflare Pages Functions port of chatbot/functions/chat.js
// (the Netlify function). Same behaviour, same prompt, same
// site-content.txt — just adapted to Cloudflare's request/env
// signature instead of Netlify's `exports.handler`.
//
// Deployed automatically by Cloudflare Pages at:
//   /api/chat
// (any file under /functions maps 1:1 to that URL path)
//
// Requires, in the Cloudflare Pages project settings:
//   Settings -> Environment variables -> GEMINI_API_KEY
// (this is a SEPARATE value from the one already set in Netlify —
// each platform keeps its own copy of the secret.)
// --------------------------------------------------------------

const MAX_MESSAGE_LENGTH = 800;
const MAX_HISTORY_TURNS = 6;
const MODEL = "gemini-3.6-flash";
const UNAVAILABLE_MESSAGE = "Sorry the content is not available yet";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // tighten to your domain once you're happy it's stable
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// The Netlify function reads this file straight off disk. Cloudflare
// Pages Functions don't get filesystem access, but they do get an
// ASSETS binding that can fetch any other file in the same deployment,
// so both platforms end up reading the exact same source file —
// regenerate it with `node chatbot/build-site-content.js` as usual and
// both chat.js copies pick up the change automatically.
let cachedSiteContent = null;
async function getSiteContent(env, request) {
  if (cachedSiteContent) return cachedSiteContent;
  const url = new URL("/chatbot/functions/site-content.txt", request.url);
  const res = await env.ASSETS.fetch(new Request(url));
  cachedSiteContent = res.ok ? await res.text() : "";
  return cachedSiteContent;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractKeywords(question) {
  const stopWords = new Set([
    "about", "what", "when", "where", "why", "how", "can", "could", "would",
    "should", "the", "this", "that", "these", "those", "with", "from",
    "into", "over", "under", "after", "before", "there", "here", "please",
    "tell", "me", "show", "give", "need", "know", "more", "some", "just",
    "like", "using", "used", "also", "very", "does", "do", "are", "is",
    "was", "were", "you", "your", "we", "our", "i", "my", "a", "an",
  ]);

  const words = normalizeText(question).split(" ").filter(function (word) {
    return word.length > 2 && !stopWords.has(word);
  });

  return Array.from(new Set(words)).slice(0, 8);
}

function buildRelevantContext(question, siteContent) {
  const keywords = extractKeywords(question);
  if (!keywords.length) {
    return siteContent.slice(0, 2600);
  }

  const pageSections = siteContent.split(/\n=== PAGE: /g)
    .map(function (section) {
      if (!section.trim()) return null;
      const clean = section.trim();
      const score = keywords.reduce(function (total, keyword) {
        return total + (clean.toLowerCase().includes(keyword) ? 2 : 0);
      }, 0);
      return score > 0 ? { score: score, text: clean } : null;
    })
    .filter(Boolean)
    .sort(function (a, b) {
      return b.score - a.score;
    })
    .slice(0, 3);

  if (!pageSections.length) {
    return siteContent.slice(0, 2600);
  }

  return pageSections
    .map(function (item) {
      return item.text.slice(0, 1200);
    })
    .join("\n\n---\n\n");
}

function detectTopic(question) {
  const text = normalizeText(question);
  const topicChecks = [
    { key: "git", labels: ["Git"] },
    { key: "github", labels: ["GitHub"] },
    { key: "jira", labels: ["Jira"] },
    { key: "confluence", labels: ["Confluence"] },
    { key: "atlassian", labels: ["Atlassian"] },
    { key: "rest api", labels: ["REST API"] },
    { key: "api", labels: ["REST API"] },
    { key: "integration", labels: ["Integrations"] },
    { key: "docker", labels: ["Docker"] },
    { key: "branch", labels: ["Git"] },
    { key: "commit", labels: ["Git"] },
    { key: "workflow", labels: ["Atlassian", "Git"] },
    { key: "project", labels: ["Projects"] },
    { key: "contact", labels: ["Contact"] },
    { key: "about", labels: ["About"] },
  ];

  const matches = topicChecks.filter(function (item) {
    return text.includes(item.key);
  });

  if (!matches.length) return null;
  const matchLabels = matches.flatMap(function (item) { return item.labels; });
  return Array.from(new Set(matchLabels)).slice(0, 2).join(" or ");
}

function findRelevantPageLink(question, siteContent) {
  const text = normalizeText(question);
  const entries = siteContent.split(/\n=== PAGE: /g).map(function (entry) {
    if (!entry.trim()) return null;

    const firstLine = (entry.split(/\n/)[0] || "").replace(/\s*===\s*$/, "").trim();
    const titleMatch = entry.match(/TITLE:\s*([\s\S]*?)(?:\n\n|$)/);
    const title = titleMatch ? titleMatch[1].trim() : "";
    const page = firstLine || "";
    const anchorBlock = (entry.match(/ANCHORS:\n([\s\S]*?)(?:\n\n|$)/) || [])[1] || "";
    const anchors = anchorBlock.split(/\n/).filter(Boolean).map(function (line) {
      const parts = line.split(" | ");
      if (parts.length < 2) return null;
      return { id: parts[0].trim(), label: parts.slice(1).join(" | ").trim() };
    }).filter(Boolean);

    const searchable = (title + " " + entry).toLowerCase();
    const score = text.split(" ").reduce(function (total, word) {
      if (!word) return total;
      return total + (searchable.includes(word) ? 2 : 0);
    }, 0);

    const bestAnchor = anchors.reduce(function (best, item) {
      const combined = (item.label + " " + item.id).toLowerCase();
      const matchScore = text.split(" ").reduce(function (sum, word) {
        if (!word) return sum;
        return sum + (combined.includes(word) ? 3 : 0);
      }, 0);

      if (matchScore > (best ? best.score : 0)) {
        return { score: matchScore, id: item.id };
      }
      return best;
    }, null);

    if (score <= 0 && !bestAnchor) return null;

    return {
      score: score + (bestAnchor ? bestAnchor.score : 0),
      page: page.replace(/\\/g, "/"),
      anchor: bestAnchor ? bestAnchor.id : null,
    };
  }).filter(Boolean).sort(function (a, b) { return b.score - a.score; });

  if (!entries.length) return null;

  const chosen = entries[0];
  const page = chosen.page || "";
  if (!page) return null;

  const publicPath = "/" + page.replace(/^\//, "");
  if (chosen.anchor) {
    return "https://techienicks.com" + publicPath + "#" + chosen.anchor;
  }

  return "https://techienicks.com" + publicPath;
}

function buildGuidedFallback(question, siteContent) {
  const pageLink = findRelevantPageLink(question, siteContent);
  if (pageLink) {
    return "Here is a relevant section: " + pageLink;
  }

  const topic = detectTopic(question);
  if (topic) {
    return "I can help with " + topic + " topics covered on this site. Try asking about Git workflow, Jira setup, Atlassian admin, REST APIs, or integrations.";
  }

  return "I can help with Git, Jira, Atlassian tools, REST APIs, and integrations covered on this site. Ask a more specific question.";
}

function buildSystemPrompt(question, siteContent) {
  const relevantContext = buildRelevantContext(question, siteContent);

  return [
    "You are the Chatbot, the help assistant embedded on techienicks.com, a personal site about Atlassian tools, Git, and REST APIs. If asked your name, say you're the Chatbot.",
    "Answer ONLY using the RELEVANT CONTENT SNIPPETS below. Do not use outside knowledge or invent details.",
    "If the answer is not clearly supported by the site content, respond with exactly: \"Sorry the content is not available yet\".",
    "Use the most relevant page or section, mention it when helpful, and keep the answer short but helpful (2-5 sentences).",
    "Prefer clear, practical explanations over generic filler.",
    "",
    "RELEVANT CONTENT SNIPPETS:",
    relevantContext,
  ].join("\n");
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return json(500, { error: "Server is missing GEMINI_API_KEY. Set it in Cloudflare Pages env vars." });
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return json(400, { error: "Invalid JSON body" });
  }

  const message = String(payload.message || "").trim();
  const history = Array.isArray(payload.history) ? payload.history : [];

  if (!message) return json(400, { error: "Message is required" });
  if (message.length > MAX_MESSAGE_LENGTH) return json(400, { error: "Message too long" });

  const siteContent = await getSiteContent(env, request);

  const trimmedHistory = history.slice(-MAX_HISTORY_TURNS).map(function (m) {
    return {
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content || "").slice(0, MAX_MESSAGE_LENGTH) }],
    };
  });

  const contents = trimmedHistory.concat([{ role: "user", parts: [{ text: message }] }]);

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    MODEL +
    ":generateContent?key=" +
    apiKey;

  try {
    const systemPrompt = buildSystemPrompt(message, siteContent);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: contents,
        generationConfig: { maxOutputTokens: 400, temperature: 0.3 },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return json(response.status, { error: (data && data.error && data.error.message) || "Upstream error" });
    }

    const candidate = (data.candidates || [])[0];
    const part = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0];
    let answer = part && part.text ? part.text : UNAVAILABLE_MESSAGE;

    if (!part && candidate && candidate.finishReason) {
      answer = buildGuidedFallback(message, siteContent);
    }
    if (answer === UNAVAILABLE_MESSAGE) {
      answer = buildGuidedFallback(message, siteContent);
    }

    return json(200, { answer: answer });
  } catch (err) {
    return json(502, { error: "Failed to reach the AI service" });
  }
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: Object.assign({ "Content-Type": "application/json" }, CORS_HEADERS),
  });
}
