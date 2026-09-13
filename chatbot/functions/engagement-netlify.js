// chatbot/functions/engagement.js
// --------------------------------------------------------------
// Netlify Function version of functions/api/engagement.js (the
// Cloudflare Pages version). Reached via the /api/engagement ->
// /.netlify/functions/engagement redirect in netlify.toml. Uses
// Netlify Blobs (already in package.json as @netlify/blobs) instead
// of a Cloudflare KV namespace for persistence — no extra setup
// needed, it works automatically once deployed on Netlify.
// --------------------------------------------------------------

const { getStore } = require("@netlify/blobs");

const ALLOWED_ACTIONS = ["view", "get", "like", "unlike"];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid JSON body" });
  }

  const page = String(payload.page || "").replace(/^\//, "");
  const action = String(payload.action || "");
  if (!/^[a-zA-Z0-9_./-]+\.html$/.test(page) || !ALLOWED_ACTIONS.includes(action)) {
    return json(400, { error: "Invalid page or action" });
  }

  // Netlify's docs confirm getStore() is shared across every deploy of the
  // site by default — including deploy previews and branch deploys, not
  // just production. Visiting a preview URL to check a fresh push fires
  // real view/like calls into the SAME store your live site reads from,
  // which is what was pulling counts down. process.env.CONTEXT is set
  // automatically by Netlify ("production", "deploy-preview",
  // "branch-deploy", or "dev"); only production writes to the real key,
  // everything else gets a "preview:" prefixed key in the same store.
  const isProduction = process.env.CONTEXT === "production";
  const key = (isProduction ? "" : "preview:") + page;

  try {
    const store = getStore("engagement");
    const existing = await store.get(key, { type: "json" });
    const current = existing || { views: 0, likes: 0 };
    if (action === "view") current.views += 1;
    if (action === "like") current.likes += 1;
    if (action === "unlike") current.likes = Math.max(0, current.likes - 1);
    await store.setJSON(key, current);
    return json(200, current);
  } catch (error) {
    return json(500, { error: "Engagement storage is unavailable" });
  }
};

function json(status, body) {
  return { statusCode: status, headers: CORS_HEADERS, body: JSON.stringify(body) };
}
