# Bloom — Habit & Wellness Dashboard

Full-stack personal habit tracker: Express + SQLite backend, vanilla HTML/CSS/JS frontend, username/password login.

## Run locally

```bash
cd habit-tracker
npm install
cp .env.example .env   # edit SESSION_SECRET to a random string
npm start
```

Open http://localhost:3000 — you'll be redirected to the sign-in page. Create an account, then start adding habits.

Data is stored in `data/bloom.sqlite` (created automatically). Back this file up if you care about your history.

## Deploy to Render (free tier)

1. Push this `habit-tracker` folder to a GitHub repo.
2. In Render, click **New > Blueprint** and point it at the repo (it reads `render.yaml` automatically), or create a **Web Service** manually with:
   - Build command: `npm install`
   - Start command: `npm start`
   - Add a **persistent disk** mounted at `data` (1GB is plenty) — without this, your habits reset every time Render restarts/redeploys the free instance.
3. Set environment variable `SESSION_SECRET` to a long random string (Render's blueprint auto-generates one).
4. Deploy. Render gives you a public HTTPS URL you can open from your phone or any browser — bookmark it for daily use.

## Deploy to Railway / Fly.io

Same idea: `npm install && npm start`, and attach a persistent volume mounted at `/app/data` (adjust `dataDir` paths in `server/db/index.js` and `server/server.js` if your mount path differs). Set `SESSION_SECRET` as an environment variable.

## Notes

- This app is single-tenant per account but supports multiple user accounts (each user only sees their own habits).
- Sessions are stored server-side in `data/sessions.sqlite` and last 30 days.
- No external services or API keys required — everything runs in one Node process plus a SQLite file.
