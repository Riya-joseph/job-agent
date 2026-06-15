const cron = require("node-cron");
const { fetchAllJobs } = require("../services/fetcher");
const { matchJobs, generateDigest } = require("../agents/jobAgent");
const { getProfile, upsertJobs, getUnseenJobs, markJobsSeen, saveDigest } = require("../db");

let botRef = null;
let chatIdRef = null;

function init(bot, chatId) {
  botRef = bot;
  chatIdRef = chatId;

  const schedule = process.env.DIGEST_CRON || "0 8 * * *";
  console.log(`[Scheduler] Digest cron: "${schedule}"`);

  cron.schedule(schedule, () => {
    console.log("[Scheduler] Triggering daily digest…");
    runDigest();
  });
}

async function runDigest(silent = false) {
  const profile = getProfile();

  if (!profile.target_roles && !profile.skills) {
    if (!silent && botRef) {
      await botRef.sendMessage(
        chatIdRef,
        "⚠️ No profile set yet\\! Use /setprofile to tell me what roles and skills you're targeting\\.",
        { parse_mode: "MarkdownV2" }
      );
    }
    return;
  }

  if (!silent && botRef) {
    await botRef.sendMessage(chatIdRef, "🔍 Scanning job boards for today's digest\\.\\.\\.", {
      parse_mode: "MarkdownV2",
    });
  }

  try {
    // 1. Fetch fresh jobs from all sources
    const freshJobs = await fetchAllJobs(profile);
    if (freshJobs.length) upsertJobs(freshJobs);

    // 2. Get jobs not yet seen by user
    const unseen = getUnseenJobs(40);
    console.log(`[Scheduler] ${unseen.length} unseen jobs to process`);

    // 3. Claude matches top 5
    const matched = await matchJobs(profile, unseen);

    // 4. Mark them seen
    if (matched.length) markJobsSeen(matched.map((j) => j.id));

    // 5. Generate digest message
    const digest = await generateDigest(profile, matched, freshJobs.length);

    // 6. Save and send
    saveDigest(digest, matched.length);

    if (botRef) {
      // Telegram MarkdownV2 needs escaped special chars — send as plain HTML fallback if needed
      try {
        await botRef.sendMessage(chatIdRef, digest, { parse_mode: "Markdown" });
      } catch {
        // Strip markdown and send plain if formatting fails
        const plain = digest.replace(/[*_`[\]()]/g, "");
        await botRef.sendMessage(chatIdRef, plain);
      }
    }

    return { matched: matched.length, total: freshJobs.length };
  } catch (err) {
    console.error("[Scheduler] runDigest error:", err);
    if (botRef && !silent) {
      await botRef.sendMessage(chatIdRef, "❌ Something went wrong running the digest. Check server logs.");
    }
  }
}

module.exports = { init, runDigest };
