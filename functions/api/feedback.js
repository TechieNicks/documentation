// functions/api/feedback.js
// --------------------------------------------------------------
// Cloudflare Pages Function that receives the site-wide "Feedback"
// modal (injected by js/main.js) and emails it via Resend. Mirrors
// chatbot/functions/feedback.js (the Netlify version) so /api/feedback
// behaves identically on either host.
//
// Deployed automatically by Cloudflare Pages at:
//   /api/feedback
//
// Requires, in the Cloudflare Pages project settings:
//   Settings -> Environment variables -> RESEND_API_KEY
//   Settings -> Environment variables -> CONTACT_TO_EMAIL
// (can reuse the same two variables you set up for contact.js —
// no need for separate ones unless you want feedback routed
// somewhere different.)
// --------------------------------------------------------------

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
  const email = String(payload.email || "").trim(); // optional

  if (!feedback) {
    return json(400, { error: "Feedback message is required." });
  }
  if (feedback.length > 5000) {
    return json(400, { error: "Feedback is too long." });
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.RESEND_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "TechieNicks feedback <onboarding@resend.dev>",
        to: [env.CONTACT_TO_EMAIL],
        reply_to: email || undefined,
        subject: "New site feedback" + (rating ? " (" + rating + ")" : ""),
        text:
          "Rating: " + (rating || "not given") + "\n" +
          "Reply-to email: " + (email || "not given") + "\n\n" +
          feedback,
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
