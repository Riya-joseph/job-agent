const TelegramBot = require("node-telegram-bot-api");
const { getProfile, saveProfile, getRecentJobs, getLastDigest } = require("../db");
const { analyseJob } = require("../agents/jobAgent");
const { runDigest } = require("../scheduler");

// Tracks multi-step /setprofile conversation state per chat
const sessions = {};

function createBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set in .env");

  // polling.params: timeout=25 keeps requests short enough for Fly.io's
  // proxy (which cuts idle connections at ~30s).
  // autoStart=false lets us attach error handlers before polling begins.
  const bot = new TelegramBot(token, {
    polling: {
      autoStart: false,
      params: {
        timeout: 25,        // long-poll window in seconds (< Fly's 30s cutoff)
        allowed_updates: ["message"],
      },
    },
  });

  // ── Polling error handler (attach BEFORE starting) ───────────
  bot.on("polling_error", (err) => {
    const code = err.code || "";
    const msg  = err.message || "";

    // 504 Gateway Timeout is normal on Fly — Telegram just timed out the
    // long-poll. node-telegram-bot-api retries automatically; just log quietly.
    if (msg.includes("504") || msg.includes("ETIMEDOUT") || msg.includes("ECONNRESET")) {
      console.warn(`[Bot] Transient polling error (will retry): ${msg.slice(0, 80)}`);
      return;
    }

    // 409 Conflict means another instance is polling — fatal on Fly if you
    // accidentally scaled to 2 machines.
    if (msg.includes("409")) {
      console.error("[Bot] 409 Conflict — another bot instance is running. Scale to 1 machine: fly scale count 1");
      return;
    }

    // Anything else is worth logging in full
    console.error("[Bot] Polling error:", msg);
  });

  // Now start polling
  bot.startPolling();
  console.log("[Bot] Telegram bot started (polling, timeout=25s)");

  // ── /start ──────────────────────────────────────────────────
  bot.onText(/\/start/, async (msg) => {
    const name = msg.from?.first_name || "there";
    await safeSend(bot, msg.chat.id,
      `👋 Hi ${name}! I'm your *AI Job Agent*.\n\nI scan job boards daily and send you personalised matches powered by Claude AI.\n\n*Commands:*\n/setprofile — Set your job preferences\n/profile — View your current profile\n/digest — Run today's digest now\n/lastdigest — Resend the last digest\n/jobs — Show recently fetched jobs\n/analyse — Analyse a specific job\n/help — Show this menu`
    );
  });

  // ── /help ───────────────────────────────────────────────────
  bot.onText(/\/help/, async (msg) => {
    await safeSend(bot, msg.chat.id,
      `*Available Commands*\n\n/setprofile — Guided setup for your job preferences\n/profile — View your saved profile\n/digest — Fetch and send today's job matches now\n/lastdigest — Resend yesterday's digest\n/jobs — List the most recently fetched raw jobs\n/analyse — Analyse how well a job fits you\n/help — Show this menu`
    );
  });

  // ── /profile ────────────────────────────────────────────────
  bot.onText(/\/profile/, async (msg) => {
    const p = getProfile();
    if (!p.target_roles && !p.skills) {
      return safeSend(bot, msg.chat.id, "No profile set yet. Use /setprofile to get started.");
    }
    await safeSend(bot, msg.chat.id,
      `*Your Profile*\n\n🎯 *Roles:* ${p.target_roles || "—"}\n🛠 *Skills:* ${p.skills || "—"}\n📋 *Experience:* ${p.experience || "—"}\n⚙️ *Preferences:* ${p.preferences || "—"}\n\n_Last updated: ${p.updated_at}_\n\nUse /setprofile to update.`
    );
  });

  // ── /setprofile (multi-step wizard) ─────────────────────────
  bot.onText(/\/setprofile/, async (msg) => {
    const chatId = msg.chat.id;
    sessions[chatId] = { step: "roles", data: {} };
    await safeSend(bot, chatId,
      `⚙️ *Profile Setup* (Step 1/4)\n\n*What job roles are you targeting?*\n\nExamples: _Frontend Developer, Data Analyst, Product Manager_`
    );
  });

  // ── /digest ─────────────────────────────────────────────────
  bot.onText(/\/digest/, async (msg) => {
    await safeSend(bot, msg.chat.id, "🚀 Running digest now — this takes ~15–30 seconds…");
    await runDigest();
  });

  // ── /lastdigest ──────────────────────────────────────────────
  bot.onText(/\/lastdigest/, async (msg) => {
    const last = getLastDigest();
    if (!last) return safeSend(bot, msg.chat.id, "No digest sent yet. Use /digest to run one.");
    await safeSend(bot, msg.chat.id, last.content);
  });

  // ── /jobs ────────────────────────────────────────────────────
  bot.onText(/\/jobs/, async (msg) => {
    const jobs = getRecentJobs(10);
    if (!jobs.length) {
      return safeSend(bot, msg.chat.id, "No jobs fetched yet. Use /digest to pull jobs.");
    }
    const lines = jobs
      .map((j, i) => `${i + 1}. *${j.title}* — ${j.company}\n   ${j.location} | ${j.source}`)
      .join("\n\n");
    await safeSend(bot, msg.chat.id, `*Recent Jobs (${jobs.length})*\n\n${lines}`);
  });

  // ── /analyse ─────────────────────────────────────────────────
  bot.onText(/\/analyse/, async (msg) => {
    const chatId = msg.chat.id;
    sessions[chatId] = { step: "analyse_title", data: {} };
    await safeSend(bot, chatId,
      `🔎 *Job Analyser*\n\nPaste the *job title and company name*\n(e.g. "Senior React Developer at Razorpay"):`
    );
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
      return safeSend(bot, chatId,
        `✅ Got it!\n\n*Step 2/4 — What are your top skills?*\n\nExamples: _Python, React, SQL, Figma, Leadership_`
      );
    }

    if (session.step === "skills") {
      session.data.skills = text;
      session.step = "experience";
      return safeSend(bot, chatId,
        `✅ Nice!\n\n*Step 3/4 — Briefly describe your experience:*\n\nExamples: _5 years in backend, led a team of 3, built microservices at a fintech startup_`
      );
    }

    if (session.step === "experience") {
      session.data.experience = text;
      session.step = "preferences";
      return safeSend(bot, chatId,
        `✅ Great!\n\n*Step 4/4 — Any location or work preferences?*\n\nExamples: _Remote only, open to Bangalore, ₹15-25 LPA, prefer product companies_`
      );
    }

    if (session.step === "preferences") {
      session.data.preferences = text;
      saveProfile(session.data);
      delete sessions[chatId];
      return safeSend(bot, chatId,
        `✅ *Profile saved!*\n\nYou'll get your first digest tomorrow morning, or run /digest now to test it immediately.`
      );
    }

    // ── Analyse wizard ────────────────────────────────────────
    if (session.step === "analyse_title") {
      session.data.jobTitle = text;
      session.step = "analyse_desc";
      return safeSend(bot, chatId, `📋 Now paste the *job description* (or a summary of it):`);
    }

    if (session.step === "analyse_desc") {
      const profile = getProfile();
      await safeSend(bot, chatId, "🤖 Analysing with Claude…");
      const [jobTitle, company] = session.data.jobTitle.split(" at ").map((s) => s.trim());
      const analysis = await analyseJob(profile, jobTitle, company || "", text);
      delete sessions[chatId];
      return safeSend(bot, chatId, `🔍 *Job Analysis*\n\n${analysis}`);
    }
  });

  return bot;
}

// ── safeSend: tries Markdown first, falls back to plain text ──
async function safeSend(bot, chatId, text) {
  try {
    await bot.sendMessage(chatId, text, { parse_mode: "Markdown" });
  } catch (err) {
    if (err.message?.includes("can't parse entities")) {
      // Strip all markdown and resend as plain text
      await bot.sendMessage(chatId, text.replace(/[*_`[\]()~>#+=|{}.!-]/g, ""));
    } else {
      console.error("[Bot] sendMessage error:", err.message);
    }
  }
}

module.exports = { createBot };