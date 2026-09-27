# Switching the chatbot to real semantic search (Vectorize)

This replaces the old keyword-frequency matching in `worker/index.js` with
actual semantic retrieval: each page is chunked, each chunk is embedded with
Gemini, and at question time the worker embeds the question and asks
Cloudflare Vectorize for the closest chunks — instead of guessing by shared
words.

## What changed

- `wrangler.jsonc` — added a `vectorize` binding (`VECTOR_INDEX`).
- `chatbot/build-embeddings.js` — new build script: chunks each page listed
  in `PAGES`, calls the Gemini embedding API on each chunk, writes
  `chatbot/functions/vectors.ndjson`.
- `worker/index.js` — `handleChat` now embeds the visitor's question, queries
  `env.VECTOR_INDEX`, and only calls Gemini for an answer when a good enough
  match exists. The old keyword-scoring functions are gone.

`chatbot/build-site-content.js` and `chatbot/functions/site-content.txt` are
no longer used by the worker — safe to leave in place or remove later,
your call.

## One-time setup

1. **Create the Vectorize index** (768 dimensions, to match
   `EMBED_DIMENSIONS` in `worker/index.js` and `OUTPUT_DIMENSIONALITY` in
   `chatbot/build-embeddings.js`):

   ```bash
   npx wrangler vectorize create techienicks-docs --dimensions=768 --metric=cosine
   ```

2. **Generate the embeddings** (needs your Gemini API key — the same one
   already in your Worker's `GEMINI_API_KEY` secret):

   ```bash
   GEMINI_API_KEY=your-key node chatbot/build-embeddings.js
   ```

   This writes `chatbot/functions/vectors.ndjson`.

3. **Upload the vectors:**

   ```bash
   npx wrangler vectorize insert techienicks-docs --file=chatbot/functions/vectors.ndjson
   ```

4. **Deploy the worker as usual:**

   ```bash
   npx wrangler deploy
   ```

## Keeping it up to date

Whenever you edit or add a page, regenerate and re-upload:

```bash
GEMINI_API_KEY=your-key node chatbot/build-embeddings.js
npx wrangler vectorize upsert techienicks-docs --file=chatbot/functions/vectors.ndjson
```

Use `upsert` (not `insert`) after the first time — `insert` errors on IDs
that already exist, `upsert` replaces them. Chunk IDs are derived from the
page path and chunk position, so editing a page and re-running the build
script updates the right vectors rather than creating duplicates.

## Tuning

- `RELEVANCE_THRESHOLD` in `worker/index.js` (default `0.4`) controls how
  close a match must be before the bot will attempt an answer at all. Raise
  it if the bot still answers questions your site doesn't cover; lower it if
  it's too quick to say "Sorry the content is not available yet."
- `TOP_K` (default `5`) is how many chunks get passed to Gemini as context.
- `CHUNK_SIZE` / `CHUNK_OVERLAP` in `chatbot/build-embeddings.js` control
  chunking — smaller chunks give more precise retrieval but less surrounding
  context per chunk.

## Cost

Both calls stay on free tiers at your current and expected scale:
- Gemini embeddings (`gemini-embedding-001`) — same free-tier API key you
  already use for the chat model.
- Cloudflare Vectorize — free tier supports up to 10 million vectors per
  index, far beyond what a growing documentation site would need.
