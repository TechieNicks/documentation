// netlify/functions/chat.js
// --------------------------------------------------------------
// Serverless endpoint the chat widget calls. Keeps GEMINI_API_KEY
// on the server — it is never sent to the browser.
//
// Uses Google's Gemini API (free tier, no billing required at
// low volume): https://ai.google.dev/gemini-api/docs/pricing
//
// Deployed automatically by Netlify at:
//   /.netlify/functions/chat
// --------------------------------------------------------------

const fs = require("fs");
const path = require("path");

const SITE_CONTENT = fs.readFileSync(
  path.join(__dirname, "site-content.txt"),
  "utf8"
);

const MAX_MESSAGE_LENGTH = 800;
const MAX_HISTORY_TURNS = 6; // last N messages kept for context
const MODEL = "gemini-3.6-flash";
const UNAVAILABLE_MESSAGE = "Sorry the content is not available yet";

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
    "was", "were", "you", "your", "we", "our", "i", "my", "a", "an"
  ]);

  const words = normalizeText(question).split(" ").filter(function (word) {
    return word.length > 2 && !stopWords.has(word);
  });

  return Array.from(new Set(words)).slice(0, 8);
}

function buildRelevantContext(question) {
  const keywords = extractKeywords(question);
  if (!keywords.length) {
    return SITE_CONTENT.slice(0, 2600);
  }

  const pageSections = SITE_CONTENT.split(/\n=== PAGE: /g)
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
    return SITE_CONTENT.slice(0, 2600);
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

function findRelevantPageLink(question) {
  const text = normalizeText(question);
  const entries = SITE_CONTENT.split(/\n=== PAGE: /g).map(function (entry) {
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

function buildGuidedFallback(question) {
  const pageLink = findRelevantPageLink(question);
  if (pageLink) {
    return "Here is a relevant section: " + pageLink;
  }

  const topic = detectTopic(question);
  if (topic) {
    return "I can help with " + topic + " topics covered on this site. Try asking about Git workflow, Jira setup, Atlassian admin, REST APIs, or integrations.";
  }

  return "I can help with Git, Jira, Atlassian tools, REST APIs, and integrations covered on this site. Ask a more specific question.";
}

function buildSystemPrompt(question) {
  const relevantContext = buildRelevantContext(question);

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

exports.handler = async function (event) {
  var headers = {
    "Access-Control-Allow-Origin": "*", // tighten to your domain once live, see README
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: headers, body: "Method not allowed" };
  }

  var apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: headers,
      body: JSON.stringify({ error: "Server is missing GEMINI_API_KEY. Set it in Netlify env vars." }),
    };
  }

  var payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  var message = (payload.message || "").toString().trim();
  var history = Array.isArray(payload.history) ? payload.history : [];

  if (!message) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: "Message is required" }) };
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: "Message too long" }) };
  }

  console.log("Chatbot query:", JSON.stringify({
    userId: payload.userId || "anonymous",
    message: message,
  }));

  // Gemini uses "user" / "model" roles (not "assistant"), and nests text in parts[]
  var trimmedHistory = history.slice(-MAX_HISTORY_TURNS).map(function (m) {
    return {
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content || "").slice(0, MAX_MESSAGE_LENGTH) }],
    };
  });

  var contents = trimmedHistory.concat([{ role: "user", parts: [{ text: message }] }]);

  var url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    MODEL +
    ":generateContent?key=" +
    apiKey;

  try {
    var systemPrompt = buildSystemPrompt(message);

    var response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: contents,
        generationConfig: {
          maxOutputTokens: 400,
          temperature: 0.3,
        },
      }),
    });

    var data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: headers,
        body: JSON.stringify({ error: (data && data.error && data.error.message) || "Upstream error" }),
      };
    }

    var candidate = (data.candidates || [])[0];
    var part = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0];
    var answer = part && part.text ? part.text : UNAVAILABLE_MESSAGE;

    // Gemini can return a finishReason like "SAFETY" with no text — handle gracefully
    if (!part && candidate && candidate.finishReason) {
      answer = buildGuidedFallback(message);
    }

    if (answer === UNAVAILABLE_MESSAGE) {
      answer = buildGuidedFallback(message);
    }

    return { statusCode: 200, headers: headers, body: JSON.stringify({ answer: answer }) };
  } catch (err) {
    return { statusCode: 502, headers: headers, body: JSON.stringify({ error: "Failed to reach the AI service" }) };
  }
};