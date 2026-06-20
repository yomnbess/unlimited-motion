# Unlimited Motion

A bring-your-own-API-key video generator UI (text-to-video and image-to-video),
built for Kling AI.

## Run it locally

```
npm install
npm run dev
```

Opens at http://localhost:5173

## Important: connecting the real Kling AI API

The backend is now built — two serverless functions live in `/api`:

- **`/api/generate.js`** — submits a text-to-video or image-to-video job to Kling
- **`/api/status.js`** — polls Kling until the video is ready, then returns the URL

The frontend automatically calls these. If they're not configured yet (e.g.
running locally without a key set), it falls back to the demo render so the
UI still works while you're setting things up — you'll see a clear
"DEMO RENDER" badge in that case, never a fake "real" result.

### To make it generate real videos:

1. Get your Kling AI API key from **app.klingai.com/global/dev** (you've
   already done this step)
2. Buy a credit package on the same dashboard (Video API tab) — the cheapest
   trial is $9.8 for 100 units, good for testing
3. Deploy this project to Vercel (see below)
4. In the Vercel project dashboard: **Settings → Environment Variables**
5. Add a new variable:
   - Name: `KLING_API_KEY`
   - Value: (paste your Kling API key)
6. Redeploy (Vercel → Deployments → click the three dots on the latest
   deployment → Redeploy) so the new env var takes effect

Your key now lives only on Vercel's servers — it's never sent to or visible
in the browser.

### Why this needs a backend at all

Kling doesn't allow direct browser calls (CORS), and even if it did, putting
your API key in frontend code means anyone could view it in dev tools and
use it themselves, burning through your paid credits. The serverless
functions in `/api` solve both problems: they run server-side, keep the key
secret, and proxy the request to Kling on the browser's behalf — same
pattern as the Bybit proxy we built earlier, just running on Vercel instead
of your own PC.

## Deploying

1. Push this folder to a GitHub repo
2. Import the repo on vercel.com → it auto-detects Vite → Deploy
3. Add your Kling Access Key + Secret Key as Environment Variables in the
   Vercel project settings (never commit them to the repo)

## Project structure

```
unlimited-motion/
├── index.html
├── package.json
├── vite.config.js
├── api/
│   ├── generate.js    — submits jobs to Kling (server-side key)
│   └── status.js      — polls Kling for completion
└── src/
    ├── main.jsx
    ├── App.jsx       — main UI logic
    ├── App.css        — darkroom/filmstrip visual identity
    └── index.css       — global resets + tokens
```
