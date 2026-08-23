// netlify/functions/chat.js
// --------------------------------------------------------------
// Serverless endpoint the chat widget calls. Keeps ANTHROPIC_API_KEY
// on the server — it is never sent to the browser.
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
  "You are the help assistant embedded on techienicks.com, a personal site about Atlassian tools, Git, and REST APIs.",
  "Answer ONLY using the SITE CONTENT provided below. Do not use outside knowledge.",
  "If the answer isn't in the site content, say you don't have that information on this site yet, and suggest the person check the TechSpec section or the Contact page.",
  "Keep answers short (2-5 sentences) and friendly. When relevant, mention which page the info came from (e.g. \"see the Git guide\").",
  "",
  "SITE CONTENT:",
  SITE_CONTENT,
].join("\n");

const MAX_MESSAGE_LENGTH = 800;
const MAX_HISTORY_TURNS = 6; // last N messages kept for context

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

  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: headers,
      body: JSON.stringify({ error: "Server is missing ANTHROPIC_API_KEY. Set it in Netlify env vars." }),
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

  // Keep only the last few turns, and only the fields Anthropic expects
  var trimmedHistory = history.slice(-MAX_HISTORY_TURNS).map(function (m) {
    return { role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, MAX_MESSAGE_LENGTH) };
  });

  var messages = trimmedHistory.concat([{ role: "user", content: message }]);

  try {
    var response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: messages,
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

    var textBlock = (data.content || []).find(function (b) { return b.type === "text"; });
    var answer = textBlock ? textBlock.text : "Sorry, I couldn't generate a response.";

    return { statusCode: 200, headers: headers, body: JSON.stringify({ answer: answer }) };
  } catch (err) {
    return { statusCode: 502, headers: headers, body: JSON.stringify({ error: "Failed to reach the AI service" }) };
  }
};
