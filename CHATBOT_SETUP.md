# TechieNicks site chatbot — setup

An AI chat widget that answers visitor questions using only the text on
your site. Powered by Google's Gemini API (free tier), run through a
Netlify Function so your API key is never exposed in the browser.

## Files added

Everything lives in one `chatbot/` folder, matching your existing layout:

```
netlify.toml                          <- updated: points Netlify at chatbot/functions
chatbot/
├── chatbot.css                       <- widget styling (matches your existing theme)
├── chatbot.js                        <- widget behavior (floating button + chat panel)
├── build-site-content.js             <- regenerates site-content.txt from your HTML pages
└── functions/
    ├── chat.js                       <- serverless function, calls the Gemini API
    └── site-content.txt              <- your site's text, fed to the model as context
```

`chatbot/functions/` is the only part Netlify treats specially — it's the
folder your `netlify.toml` now points to as the Functions directory.
`chatbot.css`, `chatbot.js`, and `build-site-content.js` are plain files
Netlify just serves/ignores like any other file in your repo.

## One-time setup

1. **Get a free Gemini API key.**
   Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey),
   sign in with a Google account, and click **Create API key**. No credit
   card required for the free tier. Copy the key.

2. **Add the key to Netlify (never to your code or GitHub repo).**
   In the Netlify dashboard: **Site configuration → Environment variables → Add a variable**
   - Key: `GEMINI_API_KEY`
   - Value: *(paste the key)*
   - Scopes: all deploy contexts

3. **Deploy.** Push these files to your repo as normal. Netlify reads the
   updated `netlify.toml` and deploys `chatbot/functions/chat.js`
   automatically — no extra build step needed.

4. **Add the widget to a page.** In `<head>`, after your existing
   stylesheet link:

   Root-level pages (`index.html`, `about.html`, `contact.html`,
   `projects.html`, `techspec.html`):
   ```html
   <link rel="stylesheet" href="chatbot/chatbot.css">
   ```
   Pages inside `pages/` (`Git.html`, `AtlassianJira.html`, etc.):
   ```html
   <link rel="stylesheet" href="../chatbot/chatbot.css">
   ```

   And right before `</body>`, after your existing script tag:

   Root-level pages:
   ```html
   <script src="chatbot/chatbot.js"></script>
   ```
   Pages inside `pages/`:
   ```html
   <script src="../chatbot/chatbot.js"></script>
   ```

   Start with one page (e.g. `index.html`) to test, then add it site-wide
   once you're happy with it.

## Resetting for logged-in users

The widget does not provide authentication. After your login code identifies
the active user, tell the widget when that identity changes:

```js
window.TechieNicksChatbot.setUser(user.id);
```

On logout, reset it to the anonymous session:

```js
window.TechieNicksChatbot.setUser(null);
```

Changing the user clears the visible conversation and keeps browser-session
history isolated per user. If the user is known before the chatbot script
loads, set `window.TN_CURRENT_USER_ID` first instead.

## Keeping the chatbot's knowledge up to date

To see what visitors are asking, open the deployed site in Netlify and view
the chatbot function logs. Each validated question is recorded with its
anonymous or supplied user ID.

Whenever you edit or add a page, regenerate the content bundle before you
deploy:

```bash
node chatbot/build-site-content.js
```

This rewrites `chatbot/functions/site-content.txt` from your current HTML
(both the root-level pages and everything in `pages/`). Commit that
updated file along with your page changes.

## Testing locally

The widget calls a relative path `/.netlify/functions/chat`, which only
exists once something is actually running the Netlify Functions runtime —
a plain `python3 -m http.server` or Live Server won't serve it. Use the
Netlify CLI instead:

```bash
npm install -g netlify-cli
netlify dev
```

This serves your whole site *and* runs the function locally, so the chatbot
works exactly like it will in production. It'll open at `http://localhost:8888`.

## Cost
Gemini 2.0 Flash (the model used here) has a free tier with no credit
card required — generous enough for a portfolio site's traffic (15
requests/minute, 1,500/day as of this writing). If you ever exceed that,
requests simply get rate-limited (a friendly error, not a bill) rather
than charging you, unless you explicitly enable billing on the Google
Cloud project. Check current limits at
[ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing),
since free-tier limits can change.

## Locking down CORS (optional, recommended once live)

Right now `chatbot/functions/chat.js` allows requests from any origin
(`Access-Control-Allow-Origin: *`) so it's easy to test. Once your site is
live on `techienicks.com`, tighten that:

```js
"Access-Control-Allow-Origin": "https://techienicks.com",
```

This stops other sites from embedding a request to your function and
running up your API bill.

## Switching to a different AI provider later

The widget and the request/response contract (`{message, history}` in,
`{answer}` out) don't care which AI provider powers `chat.js` — only the
inside of that one file needs to change. If you outgrow Gemini's free
tier, or want to compare quality, the same pattern works for:

- **Anthropic (Claude)** — best quality, pay-as-you-go, no free tier.
- **Groq** — free tier, very fast, runs open models like Llama.

Swapping providers means rewriting the `fetch()` call and the
request/response shape inside `chat.js` to match that provider's API, and
changing the environment variable name in Netlify to match. Nothing else
in this setup — the widget, the styling, the deploy process — needs to
change.

## Upgrading to real RAG later

Today the function stuffs your whole `site-content.txt` into every request
— simple and cheap at your current size. If the site grows large enough
that this gets unwieldy, the upgrade path is:

1. Split `site-content.txt` into per-page chunks at build time (the script
   already tags each page with `=== PAGE: ... ===`, so this is a small
   change).
2. Embed each chunk (e.g. via the Voyage AI or OpenAI embeddings API) and
   store the vectors somewhere (a simple JSON file works up to a few
   thousand chunks; beyond that, a hosted vector DB like Pinecone or
   Supabase's pgvector).
3. In `chatbot/functions/chat.js`, before calling Gemini: embed the user's
   question, find the top few matching chunks, and use only those as
   context instead of the whole file.

Everything else — the widget, the request/response shape, the deploy
setup — stays exactly as it is now.