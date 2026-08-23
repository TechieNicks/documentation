// netlify/functions/chat.js
// --------------------------------------------------------------
// Serverless endpoint the chat widget calls. Keeps GEMINI_API_KEY
// on the server — it is never sent to the browser.
//
// Uses Google's Gemini API free tier.
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

const SYSTEM_PROMPT = [
  "You are the Chatbot, the help assistant embedded on techienicks.com, a personal site about Atlassian tools, Git, and REST APIs. If asked your name, say you're the Chatbot.",
  "Answer ONLY using the SITE CONTENT provided below. Do not use outside knowledge.",
  "If the answer is not explicitly available in SITE CONTENT, respond with exactly: \"Sorry the content is not available yet\". Do not guess or use outside knowledge.",
  "Keep answers short (2-5 sentences) and friendly. When relevant, mention which page the info came from (e.g. \"see the Git guide\").",
  "",
  "SITE CONTENT:",
  SITE_CONTENT,
].join("\n");

const MAX_MESSAGE_LENGTH = 800;
const MAX_HISTORY_TURNS = 6; // last N messages kept for context
const MODEL = "gemini-3.6-flash";
const UNAVAILABLE_MESSAGE = "Sorry the content is not available yet";

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

  // Gemini uses "user" / "model" roles and nests text in parts[].
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
    var response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: contents,
        generationConfig: { maxOutputTokens: 400 },
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

    if (!part && candidate && candidate.finishReason) {
      answer = "I can't answer that one. Try rephrasing, or ask something else about the site.";
    }

    return { statusCode: 200, headers: headers, body: JSON.stringify({ answer: answer }) };
  } catch (err) {
    return { statusCode: 502, headers: headers, body: JSON.stringify({ error: "Failed to reach the AI service" }) };
  }
};
