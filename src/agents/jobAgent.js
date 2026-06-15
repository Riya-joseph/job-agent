const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Match & rank jobs against user profile ───────────────────
async function matchJobs(profile, jobs) {
  if (!jobs.length) return [];

  const profileSummary = `
Target Roles: ${profile.target_roles}
Skills: ${profile.skills}
Experience: ${profile.experience}
Preferences: ${profile.preferences}
  `.trim();

  const jobList = jobs
    .slice(0, 40) // cap to control token usage
    .map((j, i) => `[${i}] ${j.title} at ${j.company} (${j.location}) | ${j.source} | Tags: ${j.tags}\nDesc: ${j.description?.slice(0, 200)}`)
    .join("\n\n");

  const prompt = `You are a precise job matching agent.

USER PROFILE:
${profileSummary}

CANDIDATE JOBS (indexed):
${jobList}

Task: Pick the TOP 5 best-matching jobs from the list above.
Return ONLY a JSON array with this exact shape (no markdown, no extra text):
[
  {
    "index": <number from the list>,
    "match_score": <1-10>,
    "match_reason": "<one concise sentence explaining why this fits>"
  }
]

Rules:
- Rank strictly by relevance to the profile
- Consider role title, required skills, location/remote preference
- Return exactly 5 items, sorted best-first`;

  try {
    const res = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });

    const text = res.content[0]?.text || "[]";
    const cleaned = text.replace(/```json|```/g, "").trim();
    const matches = JSON.parse(cleaned);

    return matches
      .filter((m) => m.index >= 0 && m.index < jobs.length)
      .map((m) => ({ ...jobs[m.index], match_score: m.match_score, match_reason: m.match_reason }));
  } catch (err) {
    console.error("[Agent] matchJobs error:", err.message);
    // Fallback: return first 5 unseen jobs without scoring
    return jobs.slice(0, 5).map((j) => ({ ...j, match_score: null, match_reason: "New listing" }));
  }
}

// ── Generate the full Telegram digest message ────────────────
async function generateDigest(profile, matchedJobs, totalFetched) {
  if (!matchedJobs.length) {
    return `📭 *No new matching jobs found today.*\n\nI scanned ${totalFetched} listings but none closely matched your profile. Try broadening your skills or roles with /profile.`;
  }

  const profileSummary = `
Roles: ${profile.target_roles}
Skills: ${profile.skills}
Preferences: ${profile.preferences}
  `.trim();

  const jobDetails = matchedJobs
    .map((j, i) => {
      const score = j.match_score ? `⭐ ${j.match_score}/10` : "";
      return `Job ${i + 1}: ${j.title} @ ${j.company} | ${j.location} | ${j.remote ? "🌐 Remote" : "🏢 On-site"} | ${j.source}\nWhy it fits: ${j.match_reason}\nURL: ${j.url}`;
    })
    .join("\n\n");

  const prompt = `You are a friendly career advisor writing a daily job digest for a Telegram bot.

USER PROFILE:
${profileSummary}

TODAY'S TOP MATCHED JOBS:
${jobDetails}

Write a concise, engaging Telegram message digest. Use this structure:
1. A short (1 sentence) personalized opener referencing their role/skills
2. The 5 jobs, each formatted as:
   🔹 *Job Title* — Company
   📍 Location  |  Source
   💡 <match reason>
   🔗 <url>
3. A brief closing tip (1 sentence) relevant to their job search

Rules:
- Use Telegram MarkdownV2 formatting (*bold*, _italic_)
- Keep the whole message under 3800 characters
- Be warm but concise — no fluff
- Do NOT use # headers, use emoji bullets instead`;

  try {
    const res = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });
    return res.content[0]?.text || fallbackDigest(matchedJobs);
  } catch (err) {
    console.error("[Agent] generateDigest error:", err.message);
    return fallbackDigest(matchedJobs);
  }
}

// ── Analyse a single job on demand ──────────────────────────
async function analyseJob(profile, jobTitle, company, description) {
  const prompt = `Profile: Roles: ${profile.target_roles} | Skills: ${profile.skills} | Experience: ${profile.experience}

Job: ${jobTitle} at ${company}
Description: ${description?.slice(0, 600)}

Write a 3-bullet analysis:
• FIT: How well this matches the profile (score /10 and why)
• GAPS: Skills or experience gaps to be aware of
• TIP: One specific thing to emphasise in the application

Keep each bullet to 1–2 sentences. Plain text, no markdown.`;

  try {
    const res = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });
    return res.content[0]?.text || "Could not analyse this job right now.";
  } catch (err) {
    return "Could not analyse this job right now.";
  }
}

// ── Fallback plain digest ────────────────────────────────────
function fallbackDigest(jobs) {
  const lines = jobs.map(
    (j, i) => `${i + 1}. *${j.title}* — ${j.company}\n   ${j.location} | ${j.source}\n   ${j.url}`
  );
  return `🗓 *Daily Job Digest*\n\nHere are today's top matches:\n\n${lines.join("\n\n")}`;
}

module.exports = { matchJobs, generateDigest, analyseJob };
