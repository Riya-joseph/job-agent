const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

// ── Remotive (remote jobs, no key needed) ────────────────────
async function fetchRemotive(keywords = []) {
  try {
    const query = keywords.slice(0, 3).join(" ") || "software";
    const res = await axios.get("https://remotive.com/api/remote-jobs", {
      params: { search: query, limit: 20 },
      timeout: 10000,
    });
    const jobs = res.data?.jobs || [];
    return jobs.map((j) => ({
      id: `remotive-${j.id}`,
      title: j.title || "",
      company: j.company_name || "",
      location: j.candidate_required_location || "Remote",
      url: j.url || "",
      description: stripHtml(j.description || "").slice(0, 800),
      tags: (j.tags || []).join(","),
      source: "Remotive",
      salary: j.salary || "",
      remote: 1,
    }));
  } catch (err) {
    console.error("[Remotive] fetch failed:", err.message);
    return [];
  }
}

// ── Arbeitnow (global jobs, no key needed) ───────────────────
async function fetchArbeitnow(keywords = []) {
  try {
    const res = await axios.get("https://www.arbeitnow.com/api/job-board-api", {
      timeout: 10000,
    });
    const jobs = (res.data?.data || []).slice(0, 30);
    const query = keywords.map((k) => k.toLowerCase());

    // Filter by relevance to keywords
    const filtered = query.length
      ? jobs.filter((j) => {
          const text = `${j.title} ${j.tags?.join(" ")}`.toLowerCase();
          return query.some((k) => text.includes(k));
        })
      : jobs.slice(0, 15);

    return filtered.slice(0, 15).map((j) => ({
      id: `arbeitnow-${j.slug || uuidv4()}`,
      title: j.title || "",
      company: j.company_name || "",
      location: j.location || "Remote",
      url: j.url || "",
      description: stripHtml(j.description || "").slice(0, 800),
      tags: (j.tags || []).join(","),
      source: "Arbeitnow",
      salary: "",
      remote: j.remote ? 1 : 0,
    }));
  } catch (err) {
    console.error("[Arbeitnow] fetch failed:", err.message);
    return [];
  }
}

// ── The Muse (no key needed for basic) ──────────────────────
async function fetchTheMuse(keywords = []) {
  try {
    const query = keywords.slice(0, 2).join(" ") || "engineer";
    const res = await axios.get("https://www.themuse.com/api/public/jobs", {
      params: { descending: true, page: 0, category: query },
      timeout: 10000,
    });
    const jobs = res.data?.results || [];
    return jobs.slice(0, 15).map((j) => ({
      id: `themuse-${j.id}`,
      title: j.name || "",
      company: j.company?.name || "",
      location: (j.locations || []).map((l) => l.name).join(", ") || "Unknown",
      url: j.refs?.landing_page || "",
      description: stripHtml(j.contents || "").slice(0, 800),
      tags: (j.categories || []).map((c) => c.name).join(","),
      source: "The Muse",
      salary: "",
      remote: (j.locations || []).some((l) => l.name?.toLowerCase().includes("remote")) ? 1 : 0,
    }));
  } catch (err) {
    console.error("[TheMuse] fetch failed:", err.message);
    return [];
  }
}

// ── Adzuna (optional, needs free API key) ───────────────────
async function fetchAdzuna(keywords = [], country = "in") {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) return [];

  try {
    const query = keywords.join(" ") || "developer";
    const res = await axios.get(
      `https://api.adzuna.com/v1/api/jobs/${country}/search/1`,
      {
        params: {
          app_id: appId,
          app_key: appKey,
          results_per_page: 20,
          what: query,
          content_type: "application/json",
        },
        timeout: 10000,
      }
    );
    const jobs = res.data?.results || [];
    return jobs.map((j) => ({
      id: `adzuna-${j.id}`,
      title: j.title || "",
      company: j.company?.display_name || "",
      location: j.location?.display_name || "",
      url: j.redirect_url || "",
      description: (j.description || "").slice(0, 800),
      tags: (j.category?.label || ""),
      source: "Adzuna",
      salary: j.salary_min
        ? `${Math.round(j.salary_min / 1000)}k – ${Math.round((j.salary_max || j.salary_min) / 1000)}k`
        : "",
      remote: 0,
    }));
  } catch (err) {
    console.error("[Adzuna] fetch failed:", err.message);
    return [];
  }
}

// ── Main fetch ───────────────────────────────────────────────
async function fetchAllJobs(profile) {
  const keywords = extractKeywords(profile);
  console.log(`[Fetcher] Keywords: ${keywords.join(", ")}`);

  const [remotive, arbeitnow, muse, adzuna] = await Promise.all([
    fetchRemotive(keywords),
    fetchArbeitnow(keywords),
    fetchTheMuse(keywords),
    fetchAdzuna(keywords),
  ]);

  const all = [...remotive, ...arbeitnow, ...muse, ...adzuna];
  console.log(
    `[Fetcher] Fetched: Remotive(${remotive.length}) Arbeitnow(${arbeitnow.length}) Muse(${muse.length}) Adzuna(${adzuna.length}) = ${all.length} total`
  );
  return all;
}

// ── Helpers ──────────────────────────────────────────────────
function extractKeywords(profile) {
  const text = `${profile.target_roles} ${profile.skills}`;
  return text
    .split(/[,\s]+/)
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length > 2)
    .slice(0, 6);
}

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

module.exports = { fetchAllJobs };
