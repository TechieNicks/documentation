// chatbot/functions/engagement.js
// --------------------------------------------------------------
// Netlify Function version of functions/api/engagement.js.
//
// As of the move to Cloudflare, Cloudflare KV is the single source
// of truth for view/like counts — this function no longer keeps its
// own separate Netlify Blobs counter (which was showing a different
// number than Cloudflare depending on which host served a visitor).
// Instead it forwards every request to the live Cloudflare
// deployment, so the count is identical no matter which host
// answered the page.
//
// Requires, in Netlify: Site configuration -> Environment variables
//   CLOUDFLARE_ENGAGEMENT_URL = https://documentation.nicketa-tech.workers.dev
// (your Cloudflare Pages project's stable *.pages.dev/*.workers.dev
// URL — NOT the techienicks.com custom domain, since that may not
// always resolve to Cloudflare during a migration. If this variable
// isn't set, the hardcoded default below is used as a fallback.)
// --------------------------------------------------------------

const ALLOWED_ACTIONS = ["view", "get", "like", "unlike"];
const DEFAULT_CLOUDFLARE_URL = "https://documentation.nicketa-tech.workers.dev";

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

  const cloudflareUrl = (process.env.CLOUDFLARE_ENGAGEMENT_URL || DEFAULT_CLOUDFLARE_URL).replace(/\/$/, "");

  // Tell Cloudflare which context WE are calling from, so a Netlify
  // deploy preview / branch deploy can't accidentally increment the
  // real production count sitting in Cloudflare KV.
  const deployContext = process.env.CONTEXT === "production" ? "production" : "preview";

  try {
    const res = await fetch(cloudflareUrl + "/api/engagement", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Deploy-Context": deployContext,
      },
      body: JSON.stringify({ page: page, action: action }),
    });

    const data = await res.json();
    return json(res.status, data);
  } catch (error) {
    return json(502, { error: "Could not reach the engagement counter" });
  }
};

function json(status, body) {
  return { statusCode: status, headers: CORS_HEADERS, body: JSON.stringify(body) };
}