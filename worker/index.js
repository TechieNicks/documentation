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
    if (!/^[a-zA-Z0-9_./-]+\.html$/.test(page) || !ALLOWED_ACTIONS.includes(action)) {
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
// /api/chat — Gemini-backed chatbot, using site-content.txt bundled
// as a static asset.
// ---------------------------------------------------------------
const MAX_MESSAGE_LENGTH = 800;
const MAX_HISTORY_TURNS = 6;
const MODEL = "gemini-3.6-flash";
const UNAVAILABLE_MESSAGE = "Sorry the content is not available yet";

let cachedSiteContent = null;
async function getSiteContent(env, request) {
    if (cachedSiteContent !== null) return cachedSiteContent;
    const url = new URL("/chatbot/functions/site-content.txt", request.url);
    const res = await env.ASSETS.fetch(new Request(url));
    cachedSiteContent = res.ok ? await res.text() : "";
    return cachedSiteContent;
}

function normalizeText(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
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
    const words = normalizeText(question).split(" ").filter((w) => w.length > 2 && !stopWords.has(w));
    return Array.from(new Set(words)).slice(0, 8);
}

function buildRelevantContext(question, siteContent) {
    const keywords = extractKeywords(question);
    if (!keywords.length) return siteContent.slice(0, 2600);

    const pageSections = siteContent.split(/\n=== PAGE: /g)
        .map((section) => {
            if (!section.trim()) return null;
            const clean = section.trim();
            const score = keywords.reduce((total, k) => total + (clean.toLowerCase().includes(k) ? 2 : 0), 0);
            return score > 0 ? { score, text: clean } : null;
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

    if (!pageSections.length) return siteContent.slice(0, 2600);
    return pageSections.map((item) => item.text.slice(0, 1200)).join("\n\n---\n\n");
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
    const matches = topicChecks.filter((item) => text.includes(item.key));
    if (!matches.length) return null;
    return Array.from(new Set(matches.flatMap((m) => m.labels))).slice(0, 2).join(" or ");
}

function findRelevantPageLink(question, siteContent) {
    const text = normalizeText(question);
    const entries = siteContent.split(/\n=== PAGE: /g).map((entry) => {
        if (!entry.trim()) return null;
        const firstLine = (entry.split(/\n/)[0] || "").replace(/\s*===\s*$/, "").trim();
        const titleMatch = entry.match(/TITLE:\s*([\s\S]*?)(?:\n\n|$)/);
        const title = titleMatch ? titleMatch[1].trim() : "";
        const page = firstLine || "";
        const anchorBlock = (entry.match(/ANCHORS:\n([\s\S]*?)(?:\n\n|$)/) || [])[1] || "";
        const anchors = anchorBlock.split(/\n/).filter(Boolean).map((line) => {
            const parts = line.split(" | ");
            if (parts.length < 2) return null;
            return { id: parts[0].trim(), label: parts.slice(1).join(" | ").trim() };
        }).filter(Boolean);

        const searchable = (title + " " + entry).toLowerCase();
        const score = text.split(" ").reduce((total, w) => total + (w && searchable.includes(w) ? 2 : 0), 0);

        const bestAnchor = anchors.reduce((best, item) => {
            const combined = (item.label + " " + item.id).toLowerCase();
            const matchScore = text.split(" ").reduce((sum, w) => sum + (w && combined.includes(w) ? 3 : 0), 0);
            return matchScore > (best ? best.score : 0) ? { score: matchScore, id: item.id } : best;
        }, null);

        if (score <= 0 && !bestAnchor) return null;
        return {
            score: score + (bestAnchor ? bestAnchor.score : 0),
            page: page.replace(/\\/g, "/"),
            anchor: bestAnchor ? bestAnchor.id : null,
        };
    }).filter(Boolean).sort((a, b) => b.score - a.score);

    if (!entries.length) return null;
    const chosen = entries[0];
    if (!chosen.page) return null;
    const publicPath = "/" + chosen.page.replace(/^\//, "");
    return chosen.anchor
        ? "https://techienicks.com" + publicPath + "#" + chosen.anchor
        : "https://techienicks.com" + publicPath;
}

function buildGuidedFallback(question, siteContent) {
    const pageLink = findRelevantPageLink(question, siteContent);
    if (pageLink) return "Here is a relevant section: " + pageLink;
    const topic = detectTopic(question);
    if (topic) return "I can help with " + topic + " topics covered on this site. Try asking about Git workflow, Jira setup, Atlassian admin, REST APIs, or integrations.";
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

async function handleChat(request, env) {
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
        return json(500, { error: "Server is missing GEMINI_API_KEY." });
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

    const trimmedHistory = history.slice(-MAX_HISTORY_TURNS).map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: String(m.content || "").slice(0, MAX_MESSAGE_LENGTH) }],
    }));
    const contents = trimmedHistory.concat([{ role: "user", parts: [{ text: message }] }]);

    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent?key=" + apiKey;

    try {
        const systemPrompt = buildSystemPrompt(message, siteContent);
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
            answer = buildGuidedFallback(message, siteContent);
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