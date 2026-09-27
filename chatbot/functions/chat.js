// netlify/functions/chat.js (Netlify Functions)

const fs = require("fs");
const path = require("path");

const MODEL = "gemini-1.5-flash";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

let cachedSiteContent = null;
function getSiteContent() {
  if (cachedSiteContent !== null) return cachedSiteContent;
  try {
    cachedSiteContent = fs.readFileSync(path.join(__dirname, "site-content.txt"), "utf8");
  } catch (e) {
    cachedSiteContent = "";
  }
  return cachedSiteContent;
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS_HEADERS, body: "Method not allowed" };
  }

  // 1. Check environment variable via process.env
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json(500, { error: "Missing GEMINI_API_KEY in Netlify environment variables." });
  }

  // 2. Parse request JSON
  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON body" });
  }

  const message = String(payload.message || "").trim();
  const history = Array.isArray(payload.history) ? payload.history : [];

  if (!message) return json(400, { error: "Message is required" });
  if (message.length > 800) return json(400, { error: "Message too long" });

  // 3. Load full static content from disk
  const siteContent = getSiteContent();

  const systemPrompt = [
    "You are the official help assistant embedded on techienicks.com.",
    "Answer the user's question accurately and concisely (2-4 sentences) using ONLY the WEBSITE CONTENT below.",
    "Rules:",
    "1. Do NOT use outside knowledge or make up facts not present in the content.",
    "2. If the user asks something not covered in the content below, say: 'I couldn't find that specific information on TechieNicks. Try asking about Git workflows, Jira administration, or REST APIs.'",
    "",
    "WEBSITE CONTENT:",
    "---",
    siteContent,
    "---",
  ].join("\n");

  // 4. Map history for Gemini API
  const trimmedHistory = history.slice(-6).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.content || "").slice(0, 800) }],
  }));

  const contents = [...trimmedHistory, { role: "user", parts: [{ text: message }] }];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: contents,
        generationConfig: { maxOutputTokens: 500, temperature: 0.2 },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return json(response.status, { error: data?.error?.message || "Upstream AI Service Error" });
    }

    const candidate = data.candidates?.[0];
    const part = candidate?.content?.parts?.[0];
    const answer = part?.text || "I couldn't find that specific information on TechieNicks.";

    return json(200, { answer });
  } catch (err) {
    return json(502, { error: "Failed to connect to AI Service" });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: Object.assign({ "Content-Type": "application/json" }, CORS_HEADERS),
    body: JSON.stringify(body),
  };
}