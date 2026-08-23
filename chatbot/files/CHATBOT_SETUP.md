# TechieNicks site chatbot — setup

An AI chat widget that answers visitor questions using only the text on
your site. Powered by Claude, run through a Netlify Function so your API
key is never exposed in the browser.

## Files added

Everything lives in one `chatbot/` folder, matching your existing layout:

```
netlify.toml                          <- updated: points Netlify at chatbot/functions
chatbot/
├── chatbot.css                       <- widget styling (matches your existing theme)
├── chatbot.js                        <- widget behavior (floating button + chat panel)
├── build-site-content.js             <- regenerates site-content.txt from your HTML pages
└── functions/
    ├── chat.js                       <- serverless function, calls the Claude API
    └── site-content.txt              <- your site's text, fed to the model as context
```

`chatbot/functions/` is the only part Netlify treats specially — it's the
folder your `netlify.toml` now points to as the Functions directory.
`chatbot.css`, `chatbot.js`, and `build-site-content.js` are plain files
Netlify just serves/ignores like any other file in your repo.

## One-time setup

1. **Get an Anthropic API key.**
   Sign up / log in at [console.anthropic.com](https://console.anthropic.com),
   go to **API Keys**, and create a new key. Copy it — you won't see it again.

2. **Add the key to Netlify (never to your code or GitHub repo).**
   In the Netlify dashboard: **Site settings → Environment variables → Add a variable**
   - Key: `ANTHROPIC_API_KEY`
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

## Keeping the chatbot's knowledge up to date

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

Claude Haiku (the model used here) is inexpensive — this kind of short
Q&A, even with regular traffic on a portfolio site, typically runs a few
dollars a month at most. You can set a spend limit / usage alert in the
Anthropic console under **Billing** if you want a hard ceiling.

## Locking down CORS (optional, recommended once live)

Right now `chatbot/functions/chat.js` allows requests from any origin
(`Access-Control-Allow-Origin: *`) so it's easy to test. Once your site is
live on `techienicks.com`, tighten that:

```js
"Access-Control-Allow-Origin": "https://techienicks.com",
```

This stops other sites from embedding a request to your function and
running up your API bill.

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
3. In `chatbot/functions/chat.js`, before calling Claude: embed the user's
   question, find the top few matching chunks, and use only those as
   context instead of the whole file.

Everything else — the widget, the request/response shape, the deploy
setup — stays exactly as it is now.
