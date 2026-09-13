// chatbot/functions/contact.js
// --------------------------------------------------------------
// Netlify Function version of functions/api/contact.js (the
// Cloudflare Pages version). Reached via the /api/contact ->
// /.netlify/functions/contact redirect in netlify.toml, so the
// contact form's client-side code never needs to know which host
// is serving it. This is what keeps Netlify working as a fallback
// if Cloudflare's free tier ever gets throttled.
//
// Requires, in Netlify:
//   Site configuration -> Environment variables -> RESEND_API_KEY
//   Site configuration -> Environment variables -> CONTACT_TO_EMAIL
// (SEPARATE copies of these from the ones in Cloudflare Pages —
// each platform keeps its own.)
// --------------------------------------------------------------

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

  if (!process.env.RESEND_API_KEY || !process.env.CONTACT_TO_EMAIL) {
    return json(500, { error: "Server is missing RESEND_API_KEY or CONTACT_TO_EMAIL." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
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
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.RESEND_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "TechieNicks contact form <onboarding@resend.dev>",
        to: [process.env.CONTACT_TO_EMAIL],
        reply_to: email,
        subject: "New contact form message from " + name,
        text: "From: " + name + " <" + email + ">\n\n" + message,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return json(502, { error: "Failed to send email", detail: detail });
    }

    return json(200, { ok: true });
  } catch (err) {
    return json(502, { error: "Failed to reach email service" });
  }
};

function json(status, body) {
  return { statusCode: status, headers: CORS_HEADERS, body: JSON.stringify(body) };
}
