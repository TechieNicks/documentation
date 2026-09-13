// chatbot/functions/feedback.js
// --------------------------------------------------------------
// Netlify Function version of functions/api/feedback.js (the
// Cloudflare Pages version). Reached via the /api/feedback ->
// /.netlify/functions/feedback redirect in netlify.toml.
//
// Requires, in Netlify:
//   Site configuration -> Environment variables -> RESEND_API_KEY
//   Site configuration -> Environment variables -> CONTACT_TO_EMAIL
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
        Authorization: "Bearer " + process.env.RESEND_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "TechieNicks feedback <onboarding@resend.dev>",
        to: [process.env.CONTACT_TO_EMAIL],
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
};

function json(status, body) {
  return { statusCode: status, headers: CORS_HEADERS, body: JSON.stringify(body) };
}
