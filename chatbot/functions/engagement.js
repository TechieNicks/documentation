// functions/api/engagement.js
// --------------------------------------------------------------
// Cloudflare Pages Function port of chatbot/functions/engagement.js
// (the Netlify function). Same behaviour, but uses a Cloudflare KV
// namespace instead of @netlify/blobs for persistence.
//
// Deployed automatically by Cloudflare Pages at:
//   /api/engagement
//
// One-time setup required in the Cloudflare dashboard:
//   1. Workers & Pages -> KV -> Create namespace (e.g. "engagement")
//   2. Your Pages project -> Settings -> Functions -> KV namespace
//      bindings -> add binding named ENGAGEMENT_KV pointing at that
//      namespace (do this for both Production and Preview).
// --------------------------------------------------------------

const ALLOWED_ACTIONS = ["view", "get", "like", "unlike"];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.ENGAGEMENT_KV) {
    return json(500, { error: "ENGAGEMENT_KV binding is missing. Add it in Cloudflare Pages > Settings > Functions." });
  }

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return json(400, { error: "Invalid JSON body" });
  }

  const page = String(payload.page || "").replace(/^\//, "");
  const action = String(payload.action || "");
  if (!/^[a-zA-Z0-9_./-]+\.html$/.test(page) || !ALLOWED_ACTIONS.includes(action)) {
    return json(400, { error: "Invalid page or action" });
  }

  try {
    const existing = await env.ENGAGEMENT_KV.get(page, { type: "json" });
    const current = existing || { views: 0, likes: 0 };
    if (action === "view") current.views += 1;
    if (action === "like") current.likes += 1;
    if (action === "unlike") current.likes = Math.max(0, current.likes - 1);
    await env.ENGAGEMENT_KV.put(page, JSON.stringify(current));
    return json(200, current);
  } catch (error) {
    return json(500, { error: "Engagement storage is unavailable" });
  }
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status: status, headers: CORS_HEADERS });
}
