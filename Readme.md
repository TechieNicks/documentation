# TechieNicks

The source for [techienicks.com](https://techienicks.com/), a static HTML, CSS and JavaScript website for sharing technical guides and projects.

The site has no framework, package manager or build step. Open `index.html` in a browser for a local preview, or publish the repository root with a static hosting provider.

## Current pages

- `index.html` - Home page
- `about.html` - About page
- `techspec.html` - Technical reference and cheat-sheet index
- `projects.html` - Projects page
- `contact.html` - Contact page
- `pages/AtlassianOrg.html` - Atlassian organization administration
- `pages/Git.html` - Git notes and commands
- `pages/Linux.html` - Linux notes and commands
- `pages/Sample.html` - Sample content page
- `pages/techspec.html` - TechSpec page variant
- `pages/Virtualization.html` - Virtualization notes

## Repository structure

```text
.
├── index.html
├── about.html
├── techspec.html
├── projects.html
├── contact.html
├── pages/                 # Individual technical guides
├── css/style.css          # Site-wide styles
├── js/main.js             # Navigation and theme interactions
├── images/                # Logos, icons, photos and video assets
├── CNAME                 # Custom domain configuration
├── netlify.toml           # Netlify publish configuration
├── sitemap.xml
└── LICENSE
```

## Site features

- Responsive navigation with a mobile menu
- Light and dark theme toggle, saved in `localStorage`
- TechSpec cards linking to individual guides
- Contact form configured for Netlify Forms
- Custom favicon, logo and image assets
- Google Fonts and Font Awesome loaded from CDNs

## Local development

No dependencies are required. For the most reliable local preview, serve the repository root with any static web server. For example:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000> in a browser.

## Deployment

### Netlify

The repository includes `netlify.toml` with the root directory configured as the publish directory and no build command.

1. Import the GitHub repository in Netlify.
2. Keep the build command empty.
3. Set the publish directory to `.` if Netlify asks for it.
4. Configure `techienicks.com` under the domain settings.

Netlify Forms handles submissions from the form in `contact.html`.

### GitHub Pages

1. Open the repository's **Settings > Pages**.
2. Select **Deploy from a branch**.
3. Choose the `main` branch and the repository root.
4. Save the configuration.

GitHub Pages serves the static site, but it does not process Netlify Forms submissions.

## Version tags

Create an annotated release tag from the latest `main` commit and push it to GitHub:

```bash
git switch main
git pull origin main
git tag -a v2.0 -m "Release v2.0"
git push origin main
git push origin v2.0
```

After pushing, create a GitHub Release from the `v2.0` tag if release notes are needed.
