// worker/index.js
// --------------------------------------------------------------
// This is the ONE real entry point for the Cloudflare Worker. It
// replaces the four separate functions/api/*.js files, which only
// ever worked as auto-routing on Cloudflare *Pages* — this project
// turned out to be deployed as a plain Worker (via `wrangler deploy`,
// not `wrangler pages deploy`), which has no such auto-routing.
// Everything has to be handled by this one script's fetch() handler.
//
// It does two things:
//   1. Explicitly matches /api/chat, /api/engagement, /api/contact,
//      and /api/feedback and runs the right logic for each.
//   2. Falls back to env.ASSETS.fetch(request) for every other path,
//      which serves your existing static HTML/CSS/JS/images exactly
//      as before — nothing about how the site itself is served changes.
// --------------------------------------------------------------

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Deploy-Context",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
};

function json(status, body) {
    return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

function preflight() {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// ---------------------------------------------------------------
// /api/engagement — view/like counter backed by Cloudflare KV.
// ---------------------------------------------------------------
const ALLOWED_ACTIONS = ["view", "get", "like", "unlike"];

async function handleEngagement(request, env) {
    if (!env.ENGAGEMENT_KV) {
        return json(500, { error: "ENGAGEMENT_KV binding is missing. Create the namespace and add it to wrangler.jsonc." });
    }

    let payload;
    try {
        payload = await request.json();
    } catch (e) {
        return json(400, { error: "Invalid JSON body" });
    }

    const page = String(payload.page || "").replace(/^\//, "");
    const action = String(payload.action || "");
    if (!/^[a-zA-Z0-9_./-]+$/.test(page) || !ALLOWED_ACTIONS.includes(action)) {
        return json(400, { error: "Invalid page or action" });
    }

    const forwardedContext = request.headers.get("x-deploy-context");
    const isProduction = forwardedContext ? forwardedContext === "production" : true;
    const key = (isProduction ? "" : "preview:") + page;

    try {
        const existing = await env.ENGAGEMENT_KV.get(key, { type: "json" });
        const current = existing || { views: 0, likes: 0 };
        if (action === "view") current.views += 1;
        if (action === "like") current.likes += 1;
        if (action === "unlike") current.likes = Math.max(0, current.likes - 1);
        await env.ENGAGEMENT_KV.put(key, JSON.stringify(current));
        return json(200, current);
    } catch (error) {
        return json(500, { error: "Engagement storage is unavailable" });
    }
}

// ---------------------------------------------------------------
// /api/contact and /api/feedback — send email via Resend.
// ---------------------------------------------------------------
async function sendEmail(env, { subject, text, replyTo }) {
    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: "Bearer " + env.RESEND_API_KEY,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: "TechieNicks <onboarding@resend.dev>",
            to: [env.CONTACT_TO_EMAIL],
            reply_to: replyTo || undefined,
            subject,
            text,
        }),
    });
    if (!res.ok) {
        const detail = await res.text();
        throw new Error(detail || "Resend request failed");
    }
}

async function handleContact(request, env) {
    if (!env.RESEND_API_KEY || !env.CONTACT_TO_EMAIL) {
        return json(500, { error: "Server is missing RESEND_API_KEY or CONTACT_TO_EMAIL." });
    }

    let payload;
    try {
        payload = await request.json();
    } catch (e) {
        return json(400, { error: "Invalid JSON body" });
    }

    if (String(payload["bot-field"] || "").trim() !== "") {
        return json(200, { ok: true });
    }

    const name = String(payload.name || "").trim();
    const email = String(payload.email || "").trim();
    const message = String(payload.message || "").trim();

    if (!name || !email || !message) {
        return json(400, { error: "Name, email, and message are required." });
    }
    if (message.length > 5000) {
        return json(400, { error: "Message is too long." });
    }

    try {
        await sendEmail(env, {
            subject: "New contact form message from " + name,
            text: "From: " + name + " <" + email + ">\n\n" + message,
            replyTo: email,
        });
        return json(200, { ok: true });
    } catch (err) {
        return json(502, { error: "Failed to send email" });
    }
}

async function handleFeedback(request, env) {
    if (!env.RESEND_API_KEY || !env.CONTACT_TO_EMAIL) {
        return json(500, { error: "Server is missing RESEND_API_KEY or CONTACT_TO_EMAIL." });
    }

    let payload;
    try {
        payload = await request.json();
    } catch (e) {
        return json(400, { error: "Invalid JSON body" });
    }

    if (String(payload["bot-field"] || "").trim() !== "") {
        return json(200, { ok: true });
    }

    const rating = String(payload.rating || "").trim();
    const feedback = String(payload.feedback || "").trim();
    const email = String(payload.email || "").trim();

    if (!feedback) {
        return json(400, { error: "Feedback message is required." });
    }
    if (feedback.length > 5000) {
        return json(400, { error: "Feedback is too long." });
    }

    try {
        await sendEmail(env, {
            subject: "New site feedback" + (rating ? " (" + rating + ")" : ""),
            text:
                "Rating: " + (rating || "not given") + "\n" +
                "Reply-to email: " + (email || "not given") + "\n\n" +
                feedback,
            replyTo: email,
        });
        return json(200, { ok: true });
    } catch (err) {
        return json(502, { error: "Failed to send email" });
    }
}

// ---------------------------------------------------------------
// /api/chat — Gemini-backed chatbot, using Cloudflare Vectorize for
// semantic retrieval over embedded page chunks (see
// chatbot/build-embeddings.js) instead of keyword matching.
// ---------------------------------------------------------------
const MAX_MESSAGE_LENGTH = 800;
const MAX_HISTORY_TURNS = 6;
const MODEL = "gemini-2.5-flash";
const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIMENSIONS = 768; // must match the Vectorize index's --dimensions
const TOP_K = 5;
const RELEVANCE_THRESHOLD = 0.4; // cosine score below this = treat as "not on the site"
const UNAVAILABLE_MESSAGE = "Sorry the content is not available yet";

async function embedQuestion(apiKey, text) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${apiKey}`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: `models/${EMBED_MODEL}`,
            content: { parts: [{ text }] },
            task_type: "RETRIEVAL_QUERY",
            output_dimensionality: EMBED_DIMENSIONS,
        }),
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error((data && data.error && data.error.message) || `Embedding request failed (${res.status})`);
    }
    return data.embedding.values;
}

function pageLinkFor(match) {
    if (!match || !match.metadata || !match.metadata.page) return null;
    const publicPath = "/" + String(match.metadata.page).replace(/^\//, "").replace(/\\/g, "/");
    return match.metadata.anchor
        ? "https://techienicks.com" + publicPath + "#" + match.metadata.anchor
        : "https://techienicks.com" + publicPath;
}

function buildGuidedFallback(topMatch) {
    const link = pageLinkFor(topMatch);
    if (link) return "Here is a relevant section: " + link;
    return "I can help with Git, Jira, Atlassian tools, REST APIs, and integrations covered on this site. Ask a more specific question.";
}

function buildSystemPrompt(matches) {
    const snippets = matches
        .map((m) => {
            const label = m.metadata.title || m.metadata.page || "Untitled";
            return `[${label}]\n${m.metadata.text}`;
        })
        .join("\n\n---\n\n");
    return [
        "You are the Chatbot, the help assistant embedded on techienicks.com, a personal site about Atlassian tools, Git, and REST APIs. If asked your name, say you're the Chatbot.",
        "Answer ONLY using the RELEVANT CONTENT SNIPPETS below. Do not use outside knowledge or invent details.",
        "If the answer is not clearly supported by the site content, respond with exactly: \"Sorry the content is not available yet\".",
        "Use the most relevant page or section, mention it when helpful, and keep the answer short but helpful (2-5 sentences).",
        "Prefer clear, practical explanations over generic filler.",
        "",
        "RELEVANT CONTENT SNIPPETS:",
        snippets,
    ].join("\n");
}

async function handleChat(request, env) {
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
        return json(500, { error: "Server is missing GEMINI_API_KEY." });
    }
    if (!env.VECTOR_INDEX) {
        return json(500, { error: "VECTOR_INDEX binding is missing. Add the Vectorize index to wrangler.jsonc." });
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

    // Semantic retrieval: embed the question, find the closest page chunks.
    let matches = [];
    try {
        const questionVector = await embedQuestion(apiKey, message);
        const result = await env.VECTOR_INDEX.query(questionVector, { topK: TOP_K, returnMetadata: "all" });
        matches = (result && result.matches) || [];
    } catch (err) {
        return json(502, { error: "Failed to reach the embedding/retrieval service" });
    }

    const topMatch = matches[0];
    const relevantMatches = matches.filter((m) => m.score >= RELEVANCE_THRESHOLD);

    // Nothing on the site is close enough to the question — skip the Gemini
    // call entirely rather than risk it improvising from weak context.
    if (!relevantMatches.length) {
        return json(200, { answer: buildGuidedFallback(topMatch) });
    }

    const trimmedHistory = history.slice(-MAX_HISTORY_TURNS).map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: String(m.content || "").slice(0, MAX_MESSAGE_LENGTH) }],
    }));
    const contents = trimmedHistory.concat([{ role: "user", parts: [{ text: message }] }]);

    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent?key=" + apiKey;

    try {
        const systemPrompt = buildSystemPrompt(relevantMatches);
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents,
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
        if ((!part && candidate && candidate.finishReason) || answer === UNAVAILABLE_MESSAGE) {
            answer = buildGuidedFallback(topMatch);
        }

        return json(200, { answer });
    } catch (err) {
        return json(502, { error: "Failed to reach the AI service" });
    }
}

// ---------------------------------------------------------------
// Main router
// ---------------------------------------------------------------
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
            return preflight();
        }

        if (request.method === "POST") {
            if (url.pathname === "/api/engagement") return handleEngagement(request, env);
            if (url.pathname === "/api/contact") return handleContact(request, env);
            if (url.pathname === "/api/feedback") return handleFeedback(request, env);
            if (url.pathname === "/api/chat") return handleChat(request, env);
        }

        // Everything else: serve the static site exactly as before.
        return env.ASSETS.fetch(request);
    },
};