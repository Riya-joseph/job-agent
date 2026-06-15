# 🤖 AI Job Agent — Telegram Bot

![CI](https://github.com/YOUR_USERNAME/job-agent/actions/workflows/ci.yml/badge.svg)
![Deploy](https://github.com/YOUR_USERNAME/job-agent/actions/workflows/deploy.yml/badge.svg)
![Node](https://img.shields.io/badge/node-20-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

A self-hosted AI agent that scrapes job boards every day, matches listings to your profile using **Claude AI**, and delivers a personalised digest straight to your **Telegram**.

Auto-deploys to **Fly.io** (free tier) on every push to `main`.

---

## How it works

```
Every morning (8 AM by default):

1. FETCH   → Pulls new listings from Remotive, Arbeitnow, The Muse (+ Adzuna optional)
2. STORE   → Saves to SQLite, skips jobs you've already seen
3. MATCH   → Claude reads your profile + unseen jobs → picks top 5 with reasons
4. DIGEST  → Claude writes a personalised Telegram message
5. SEND    → Bot delivers it to your chat
```

---

## Telegram Commands

| Command | Description |
|---|---|
| `/start` | Welcome + command list |
| `/setprofile` | 4-step wizard — roles, skills, experience, preferences |
| `/profile` | View your saved profile |
| `/digest` | Run a fetch + AI match + send digest right now |
| `/lastdigest` | Resend the most recent digest |
| `/jobs` | List recently fetched raw jobs |
| `/analyse` | Paste a job title + description → Claude scores the fit |
| `/help` | Show command list |

---

## Deployment — Fly.io (Free)

This repo auto-deploys to [Fly.io](https://fly.io) on every push to `main` via GitHub Actions.

### First-time setup (do this once)

**1. Install flyctl**
```bash
curl -L https://fly.io/install.sh | sh
fly auth login
```

**2. Edit `fly.toml`**

Change the `app` name to something globally unique:
```toml
app = "job-agent-yourname"
```

**3. Launch the app on Fly**
```bash
fly launch --no-deploy
```

**4. Create a persistent volume for SQLite**
```bash
fly volumes create job_agent_data --size 1 --region sin
```

**5. Set your secrets**
```bash
fly secrets set ANTHROPIC_API_KEY=sk-ant-...
fly secrets set TELEGRAM_BOT_TOKEN=123456:ABC...
fly secrets set TELEGRAM_CHAT_ID=987654321
fly secrets set DIGEST_CRON="0 8 * * *"
```

**6. Add `FLY_API_TOKEN` to GitHub**
```bash
fly tokens create deploy -x 999999h   # copy the token
```
Go to GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**
- Name: `FLY_API_TOKEN`
- Value: the token above

**7. Push to deploy**
```bash
git push origin main
```

GitHub Actions runs CI → then deploys to Fly. Every future push to `main` does the same automatically.

---

### Fly.io cheatsheet

```bash
fly status                  # is the app running?
fly logs                    # live log stream
fly ssh console             # SSH into the container
fly secrets list            # see which secrets are set
fly volumes list            # check the persistent volume
fly deploy                  # manual deploy (skip GitHub)
fly scale show              # check VM size / count
```

---

## Local development

**Requirements:** Node 20+

```bash
git clone https://github.com/YOUR_USERNAME/job-agent.git
cd job-agent
cp .env.example .env        # fill in your 3 keys
npm install
npm start
```

Or with Docker:
```bash
docker-compose up
```

---

## Getting your API keys

| Service | How | Required |
|---|---|---|
| Anthropic | https://console.anthropic.com | ✅ |
| Telegram Bot Token | Message `@BotFather` → `/newbot` | ✅ |
| Your Chat ID | Message `@userinfobot` | ✅ |
| Adzuna (Indian jobs) | https://developer.adzuna.com | ❌ Optional |

---

## Configuration

All config is via environment variables (`.env` locally, `fly secrets` in production):

```env
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_CHAT_ID=987654321

# Cron schedule — when to send the daily digest
DIGEST_CRON=0 8 * * *       # 8 AM daily (default)
# DIGEST_CRON=0 7 * * 1-5   # Weekdays at 7 AM
# DIGEST_CRON=0 9,18 * * *  # Twice daily

# Optional Adzuna for Indian job listings
ADZUNA_APP_ID=...
ADZUNA_APP_KEY=...
```

---

## Project structure

```
job-agent/
├── src/
│   ├── index.js              # Entry point + Fly health server
│   ├── agents/jobAgent.js    # Claude AI: matching, digest, analysis
│   ├── bot/index.js          # Telegram commands + conversation wizard
│   ├── db/index.js           # SQLite schema + helpers
│   ├── scheduler/index.js    # node-cron daily runner
│   └── services/fetcher.js   # Job board integrations
├── .github/
│   ├── workflows/
│   │   ├── ci.yml            # Syntax check on every push
│   │   └── deploy.yml        # Auto-deploy to Fly.io on push to main
│   ├── dependabot.yml        # Weekly dependency updates
│   └── ISSUE_TEMPLATE/       # Bug + feature request forms
├── fly.toml                  # Fly.io app config
├── Dockerfile
├── docker-compose.yml        # Local Docker setup
├── .env.example
└── package.json
```

---

## Adding a new job source

Add a fetch function in `src/services/fetcher.js` and include it in `fetchAllJobs()`. Each job needs:

```js
{ id, title, company, location, url, description, tags, source, salary, remote }
```

---

## License

MIT
