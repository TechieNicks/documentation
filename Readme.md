# TechieNicks

<table>
	<tr>
		<td><a href="https://techienicks.com/"><img src="images/favicon-200x200.png" alt="TechieNicks"></a></td>
		<td>This build of <a href="https://techienicks.com/">techienicks.com</a> uses static HTML/CSS/JS with no frontend framework or build step. It is deployed on Netlify, with serverless chatbot functionality and a light/dark theme toggle.</td>
	</tr>
</table>

## Features

- Static HTML, CSS, and JavaScript website
- Responsive layout for desktop and mobile
- Light and dark theme toggle
- Technical documentation and project pages
- Netlify deployment with continuous deployment
- AI chatbot powered by Gemini through a Netlify Function
- Sitemap and custom domain configuration

## Tech Stack

- HTML5
- CSS3
- Vanilla JavaScript
- Netlify Hosting
- Netlify Functions
- Google Gemini API

## Local Development

The frontend can be previewed with any static web server. To run the chatbot
locally, use the Netlify CLI:

```bash
npm install
npm install -g netlify-cli
netlify dev
```

The site will be available at `http://localhost:8888`.

## Deployment | [![Netlify Status](https://api.netlify.com/api/v1/badges/1223a208-95c8-4325-a3eb-9474a22bd3c2/deploy-status)](https://app.netlify.com/projects/documentation-techienicks/deploys)

The project is deployed through Netlify:

- Publish directory: `.`
- Build command: none
- Functions directory: `chatbot/functions`
- Production domain: [techienicks.com](https://techienicks.com/)

Changes pushed to the repository are deployed automatically by Netlify.




