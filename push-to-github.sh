#!/bin/bash
# ─────────────────────────────────────────────────────────────
# push-to-github.sh
# Run this ONCE to initialise the git repo and push to GitHub.
# Usage: bash push-to-github.sh <your-github-username>
# ─────────────────────────────────────────────────────────────

set -e

USERNAME=${1:-"YOUR_USERNAME"}
REPO="job-agent"
REMOTE="https://github.com/${USERNAME}/${REPO}.git"

echo ""
echo "📦 Initialising git repo..."
git init
git branch -M main

echo ""
echo "📝 Staging files..."
git add .

echo ""
echo "✅ Files to be committed:"
git status --short

echo ""
echo "💾 Creating initial commit..."
git commit -m "feat: initial AI job agent with Telegram bot

- Daily job scraping from Remotive, Arbeitnow, The Muse, Adzuna
- Claude AI matching: picks top 5 jobs per user profile
- Telegram bot with /setprofile, /digest, /analyse commands
- SQLite persistence, seen-job deduplication
- node-cron daily scheduler (configurable)
- Docker + docker-compose for deployment
- GitHub Actions CI on push"

echo ""
echo "🔗 Adding remote: ${REMOTE}"
git remote add origin "${REMOTE}"

echo ""
echo "🚀 Pushing to GitHub..."
git push -u origin main

echo ""
echo "✅ Done! Your repo is live at:"
echo "   https://github.com/${USERNAME}/${REPO}"
echo ""
echo "Next steps:"
echo "  1. Go to your repo → Settings → Secrets and variables → Actions"
echo "  2. Add ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID as secrets"
echo "     (if you want CI to do live checks in future)"
echo "  3. To deploy: see README.md → Deployment Options"
