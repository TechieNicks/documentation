// functions/api/chat.js (Cloudflare Pages Function)

const MODEL = "gemini-1.5-flash";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // 1. Ensure GEMINI_API_KEY is present in Cloudflare Pages
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: "Missing GEMINI_API_KEY in Cloudflare environment variables." }, 500);
  }

  // 2. Parse request payload
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const message = String(payload.message || "").trim();
  const history = Array.isArray(payload.history) ? payload.history : [];

  if (!message) return jsonResponse({ error: "Message is required" }, 400);
  if (message.length > 800) return jsonResponse({ error: "Message too long" }, 400);

  // 3. Load site-content.txt via internal fetch
  let siteContent = "";
  try {
    const origin = new URL(request.url).origin;
    const contentRes = await fetch(`${origin}/site-content.txt`);
    if (contentRes.ok) {
      siteContent = await contentRes.text();
    }
  } catch (e) {
    console.error("Could not load site-content.txt", e);
  }

  // 4. Build System Prompt with Full Content
  const systemPrompt = [
    "You are the official help assistant embedded on techienicks.com.",
    "Answer the user's question accurately and concisely (2-4 sentences) using ONLY the WEBSITE CONTENT below.",
    "Rules:",
    "1. Do NOT use outside knowledge or make up facts not present in the content.",
    "2. If the user asks something not covered in the content below, respond with:",
    "   'I couldn't find that specific information on TechieNicks. Try asking about Git workflows, Jira administration, or REST APIs.'",
    "",
    "WEBSITE CONTENT:",
    "---",
    siteContent,
    "---"
  ].join("\n");

  // 5. Build conversation turns for Gemini
  const trimmedHistory = history.slice(-6).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.content || "").slice(0, 800) }],
  }));

  const contents = [...trimmedHistory, { role: "user", parts: [{ text: message }] }];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

  try {
    const apiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: contents,
        generationConfig: { maxOutputTokens: 500, temperature: 0.2 },
      }),
    });

    const data = await apiRes.json();

    if (!apiRes.ok) {
      return jsonResponse({ error: data?.error?.message || "Upstream AI Service Error" }, apiRes.status);
    }

    const candidate = data?.candidates?.[0];
    const part = candidate?.content?.parts?.[0];
    const answer = part?.text || "I couldn't find that specific information on TechieNicks.";

    return jsonResponse({ answer }, 200);
  } catch (err) {
    return jsonResponse({ error: "Failed to connect to AI Service" }, 502);
  }
}

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}