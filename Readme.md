# TechieNicks — website rebuild

A modern rebuild of techienicks.com: static HTML/CSS/JS (no build step, no framework), with a light/dark theme toggle and pages for Home, About, TechSpec, Projects and Contact.

## What changed from the original

- Kept the violet → pink gradient and cream/dark palette pulled from your logo, applied consistently across all pages via CSS variables.
- Added a **light/dark theme toggle** (top right of the nav) — it remembers the visitor's choice via `localStorage` and respects their OS preference on first visit.
- Added **About**, **Projects** and **Contact** pages that didn't exist before.
- Turned the three TechSpec topics into a proper card grid, plus three placeholder cards (JIRA/Atlassian, CI/CD, Cloud) you can fill in or remove.
- Pulled real repos from your GitHub (`nodedemo`, `Cheet-sheet`, the JIRA-on-CentOS gist) into the Projects page instead of leaving it empty.
- Added a working **contact form** wired for Netlify Forms — no backend required.
- Mobile nav (hamburger menu), keyboard-focus styles, and `prefers-reduced-motion` support.

## File structure

```
site/
├── index.html
├── about.html
├── techspec.html
├── projects.html
├── contact.html
├── css/style.css
├── js/main.js
├── images/logo.png
└── pages/            ← put your existing Git.html, Linux.html, Virtualization.html here
```

## Things to personalize before you publish

1. **about.html** — replace the placeholder bio, adjust the `data-level` values in the skill bars to your real proficiency, and update the timeline entries.
2. **about.html "Download resume" button** — currently points to `assets/resume.pdf`, which doesn't exist yet. Add your resume PDF at that path, or remove the button.
3. **contact.html** — swap `hello@techienicks.com` for your real email.
4. **techspec.html** — the last three cards (JIRA, CI/CD, Cloud) link to pages that don't exist yet (`pages/Jira.html`, etc.). Either create those pages or remove the cards.
5. **pages/** folder — copy your original `Git.html`, `Linux.html`, and `Virtualization.html` files in here (from your old site) so the TechSpec links work immediately. If you'd rather I rebuild those pages in the new style, just share their content.

## New logo & icon system

Since I can't generate illustrated/Bitmoji-style art, I designed a new **vector mark** (SVG) instead — it keeps a "glimpse of you" (hair, round sunglasses, smile) but as a clean, scalable shape that stays sharp at any size and adapts better across dark/light mode than a raster Bitmoji export.

- `images/logo-mark.svg` — the primary mark. Used in the nav and as the About-page avatar. Edit the fill colors directly in the SVG (it's plain XML) to restyle hair/skin/shirt colors any time.
- `images/favicon.ico`, `images/favicon-16.png`, `images/favicon-32.png`, `images/apple-touch-icon.png` — generated from the mark, already wired into every page's `<head>`.
- `images/logo-mark-512.png` — high-res PNG export, useful anywhere an SVG isn't accepted.
- `images/youtube/youtube-channel-icon-800.png` — 800×800 PNG sized for YouTube's channel-icon upload (Settings → Branding → Picture).

### Per-post / per-topic icons

`images/icons/` has six matching badge icons (Git, Linux, Docker, JIRA, Cloud, CI/CD) in both `.svg` and `.png`, built in the same gradient-badge style as the mark. These are what `techspec.html`'s cards use, and they're meant to be reused as:

- Thumbnails for individual blog posts or videos
- Icons next to future TechSpec topics

To add a new topic icon: duplicate any `icon-*.svg` in `images/icons/`, swap the inner `<g>` shape for a new symbol (keep the same `viewBox="0 0 200 200"` and gradient circle), and it'll automatically match the rest of the site.

## Deploying

### Option A: Netlify (recommended — gets you the working contact form for free)

1. Push this folder to a GitHub repository.
2. In Netlify: **Add new site → Import an existing project → GitHub**, pick the repo.
3. Build command: leave blank. Publish directory: `/` (the repo root, since there's no build step).
4. Deploy. Netlify auto-detects the `data-netlify="true"` form in `contact.html` and starts collecting submissions under **Site → Forms** — no extra setup.
5. Point your `techienicks.com` domain at the Netlify site under **Domain settings**.

### Option B: GitHub Pages

1. Push this folder to a GitHub repository.
2. Repo **Settings → Pages → Source**: deploy from the branch containing this code (root).
3. Note: the contact form won't work on GitHub Pages (it's static hosting only, no form backend) — either keep Netlify for the form or swap it for a service like Formspree.

## Notes

- Fonts (Space Grotesk, Inter, JetBrains Mono) load from Google Fonts via CDN — no local font files needed.
- No dependencies, no `npm install`, no build step. Just static files.
