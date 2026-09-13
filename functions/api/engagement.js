// functions/api/engagement.js
// --------------------------------------------------------------
// Cloudflare Pages Function — the single source of truth for view/
// like counts. Netlify's engagement.js no longer keeps its own
// separate counter; it proxies every request here, so a visitor
// sees the same number regardless of which host actually served
// the page. Direct visits to Cloudflare are also handled as before.
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
  "Access-Control-Allow-Headers": "Content-Type, X-Deploy-Context",
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

  // Cloudflare Pages spins up a preview deploy for every push (and every
  // branch), but by default they all read/write the SAME KV namespace as
  // production — and now Netlify proxies here too. Requests forwarded by
  // Netlify's engagement.js carry an X-Deploy-Context header ("production"
  // or "preview") telling us which context THEY are calling from; direct
  // visits to Cloudflare fall back to checking CF_PAGES_BRANCH itself.
  // Only real production traffic (from either host) writes to the real
  // key — everything else gets a "preview:" prefixed key in the same
  // namespace so it can never touch live data. Adjust "main" below if
  // your production branch has a different name.
  const forwardedContext = request.headers.get("x-deploy-context");
  const isProduction = forwardedContext
    ? forwardedContext === "production"
    : env.CF_PAGES_BRANCH === "main";
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

function json(status, body) {
  return new Response(JSON.stringify(body), { status: status, headers: CORS_HEADERS });
}