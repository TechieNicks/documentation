// functions/api/contact.js
// --------------------------------------------------------------
// Cloudflare Pages Function that receives the "Send message" contact
// form (contact.html) and emails it via Resend. Mirrors
// chatbot/functions/contact.js (the Netlify version of this same
// function) so /api/contact behaves identically on either host —
// Netlify keeps working as a fallback if Cloudflare's free tier
// ever gets throttled, and vice versa.
//
// Deployed automatically by Cloudflare Pages at:
//   /api/contact
// (any file under /functions maps 1:1 to that URL path)
//
// Requires, in the Cloudflare Pages project settings:
//   Settings -> Environment variables -> RESEND_API_KEY
//   Settings -> Environment variables -> CONTACT_TO_EMAIL
// (these are SEPARATE values from the ones you'll set in Netlify —
// each platform keeps its own copy of the secret.)
// --------------------------------------------------------------

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // tighten to your domain once stable
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.RESEND_API_KEY || !env.CONTACT_TO_EMAIL) {
    return json(500, { error: "Server is missing RESEND_API_KEY or CONTACT_TO_EMAIL." });
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return json(400, { error: "Invalid JSON body" });
  }

  // Honeypot: a real visitor never fills this hidden field in.
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
        Authorization: "Bearer " + env.RESEND_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "TechieNicks contact form <onboarding@resend.dev>",
        to: [env.CONTACT_TO_EMAIL],
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
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status: status, headers: CORS_HEADERS });
}
