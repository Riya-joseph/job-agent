const TelegramBot = require("node-telegram-bot-api");
const { getProfile, saveProfile, getRecentJobs, getLastDigest } = require("../db");
const { analyseJob } = require("../agents/jobAgent");
const { runDigest } = require("../scheduler");

// Tracks multi-step /setprofile conversation state per chat
const sessions = {};

function createBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set in .env");

  const bot = new TelegramBot(token, { polling: true });
  console.log("[Bot] Telegram bot started (polling)");

  // ── /start ──────────────────────────────────────────────────
  bot.onText(/\/start/, async (msg) => {
    const name = msg.from?.first_name || "there";
    await bot.sendMessage(
      msg.chat.id,
      `👋 Hi ${name}\\! I'm your *AI Job Agent*\\.\n\nI scan job boards daily and send you personalised matches powered by Claude AI\\.\n\n*Commands:*\n/setprofile — Set your job preferences\n/profile — View your current profile\n/digest — Run today's digest now\n/lastdigest — Resend the last digest\n/jobs — Show recently fetched jobs\n/analyse — Analyse a specific job\n/help — Show this menu`,
      { parse_mode: "MarkdownV2" }
    );
  });

  // ── /help ───────────────────────────────────────────────────
  bot.onText(/\/help/, async (msg) => {
    await bot.sendMessage(
      msg.chat.id,
      `*Available Commands*\n\n/setprofile — Guided setup for your job preferences\n/profile — View your saved profile\n/digest — Fetch and send today's job matches now\n/lastdigest — Resend yesterday's digest\n/jobs — List the most recently fetched raw jobs\n/analyse — Analyse how well a job fits you\n/help — Show this menu`,
      { parse_mode: "Markdown" }
    );
  });

  // ── /profile ────────────────────────────────────────────────
  bot.onText(/\/profile/, async (msg) => {
    const p = getProfile();
    if (!p.target_roles && !p.skills) {
      return bot.sendMessage(msg.chat.id, "No profile set yet\\. Use /setprofile to get started\\.", {
        parse_mode: "MarkdownV2",
      });
    }
    await bot.sendMessage(
      msg.chat.id,
      `*Your Profile*\n\n🎯 *Roles:* ${p.target_roles || "—"}\n🛠 *Skills:* ${p.skills || "—"}\n📋 *Experience:* ${p.experience || "—"}\n⚙️ *Preferences:* ${p.preferences || "—"}\n\n_Last updated: ${p.updated_at}_\n\nUse /setprofile to update.`,
      { parse_mode: "Markdown" }
    );
  });

  // ── /setprofile (multi-step wizard) ─────────────────────────
  bot.onText(/\/setprofile/, async (msg) => {
    const chatId = msg.chat.id;
    sessions[chatId] = { step: "roles", data: {} };
    await bot.sendMessage(
      chatId,
      `⚙️ *Profile Setup* (Step 1/4)\n\n*What job roles are you targeting?*\n\nExamples: _Frontend Developer, Data Analyst, Product Manager_`,
      { parse_mode: "Markdown" }
    );
  });

  // ── /digest ─────────────────────────────────────────────────
  bot.onText(/\/digest/, async (msg) => {
    await bot.sendMessage(msg.chat.id, "🚀 Running digest now — this takes ~15–30 seconds…");
    await runDigest();
  });

  // ── /lastdigest ──────────────────────────────────────────────
  bot.onText(/\/lastdigest/, async (msg) => {
    const last = getLastDigest();
    if (!last) return bot.sendMessage(msg.chat.id, "No digest sent yet. Use /digest to run one.");
    try {
      await bot.sendMessage(msg.chat.id, last.content, { parse_mode: "Markdown" });
    } catch {
      await bot.sendMessage(msg.chat.id, last.content.replace(/[*_`[\]()]/g, ""));
    }
  });

  // ── /jobs ────────────────────────────────────────────────────
  bot.onText(/\/jobs/, async (msg) => {
    const jobs = getRecentJobs(10);
    if (!jobs.length) {
      return bot.sendMessage(msg.chat.id, "No jobs fetched yet. Use /digest to pull jobs.");
    }
    const lines = jobs
      .map((j, i) => `${i + 1}. *${j.title}* — ${j.company}\n   ${j.location} | ${j.source}`)
      .join("\n\n");
    await bot.sendMessage(msg.chat.id, `*Recent Jobs (${jobs.length})*\n\n${lines}`, {
      parse_mode: "Markdown",
    });
  });

  // ── /analyse ─────────────────────────────────────────────────
  bot.onText(/\/analyse/, async (msg) => {
    const chatId = msg.chat.id;
    sessions[chatId] = { step: "analyse_title", data: {} };
    await bot.sendMessage(chatId, "🔎 *Job Analyser*\n\nPaste the *job title and company name* (e.g. 'Senior React Developer at Razorpay'):", {
      parse_mode: "Markdown",
    });
  });

  // ── Generic message handler (wizard steps) ───────────────────
  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    if (!text || text.startsWith("/")) return;

    const session = sessions[chatId];
    if (!session) return;

    // ── Profile wizard ────────────────────────────────────────
    if (session.step === "roles") {
      session.data.target_roles = text;
      session.step = "skills";
      return bot.sendMessage(
        chatId,
        `✅ Got it\\!\n\n*Step 2/4 — What are your top skills?*\n\nExamples: _Python, React, SQL, Figma, Leadership_`,
        { parse_mode: "MarkdownV2" }
      );
    }

    if (session.step === "skills") {
      session.data.skills = text;
      session.step = "experience";
      return bot.sendMessage(
        chatId,
        `✅ Nice\\!\n\n*Step 3/4 — Briefly describe your experience:*\n\nExamples: _5 years in backend development, led a team of 3, built microservices at a fintech startup_`,
        { parse_mode: "MarkdownV2" }
      );
    }

    if (session.step === "experience") {
      session.data.experience = text;
      session.step = "preferences";
      return bot.sendMessage(
        chatId,
        `✅ Great\\!\n\n*Step 4/4 — Any location or work preferences?*\n\nExamples: _Remote only, open to Bangalore, ₹15\\-25 LPA, prefer product companies_`,
        { parse_mode: "MarkdownV2" }
      );
    }

    if (session.step === "preferences") {
      session.data.preferences = text;
      saveProfile(session.data);
      delete sessions[chatId];
      return bot.sendMessage(
        chatId,
        `✅ *Profile saved\\!*\n\nYou'll get your first digest tomorrow morning, or run /digest now to test it immediately\\.`,
        { parse_mode: "MarkdownV2" }
      );
    }

    // ── Analyse wizard ────────────────────────────────────────
    if (session.step === "analyse_title") {
      session.data.jobTitle = text;
      session.step = "analyse_desc";
      return bot.sendMessage(
        chatId,
        `📋 Now paste the *job description* (or a summary of it):`,
        { parse_mode: "Markdown" }
      );
    }

    if (session.step === "analyse_desc") {
      const profile = getProfile();
      await bot.sendMessage(chatId, "🤖 Analysing with Claude…");
      const [jobTitle, company] = session.data.jobTitle.split(" at ").map((s) => s.trim());
      const analysis = await analyseJob(profile, jobTitle, company || "", text);
      delete sessions[chatId];
      return bot.sendMessage(chatId, `🔍 *Job Analysis*\n\n${analysis}`, { parse_mode: "Markdown" });
    }
  });

  bot.on("polling_error", (err) => {
    console.error("[Bot] Polling error:", err.message);
  });

  return bot;
}

module.exports = { createBot };
