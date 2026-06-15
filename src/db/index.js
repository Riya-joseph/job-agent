const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DB_PATH = process.env.DB_PATH || "./data/jobs.db";

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY,
    target_roles TEXT NOT NULL DEFAULT '',
    skills TEXT NOT NULL DEFAULT '',
    experience TEXT NOT NULL DEFAULT '',
    preferences TEXT NOT NULL DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT,
    url TEXT,
    description TEXT,
    tags TEXT,
    source TEXT,
    salary TEXT,
    remote INTEGER DEFAULT 0,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS digests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    job_count INTEGER DEFAULT 0,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS seen_jobs (
    job_id TEXT PRIMARY KEY,
    seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Insert default empty profile if none exists
  INSERT OR IGNORE INTO profile (id) VALUES (1);
`);

// ── Profile ─────────────────────────────────────────────────

function getProfile() {
  return db.prepare("SELECT * FROM profile WHERE id = 1").get();
}

function saveProfile(fields) {
  const stmt = db.prepare(`
    UPDATE profile SET
      target_roles = COALESCE(@target_roles, target_roles),
      skills       = COALESCE(@skills, skills),
      experience   = COALESCE(@experience, experience),
      preferences  = COALESCE(@preferences, preferences),
      updated_at   = CURRENT_TIMESTAMP
    WHERE id = 1
  `);
  stmt.run(fields);
  return getProfile();
}

// ── Jobs ─────────────────────────────────────────────────────

function upsertJobs(jobs) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO jobs (id, title, company, location, url, description, tags, source, salary, remote)
    VALUES (@id, @title, @company, @location, @url, @description, @tags, @source, @salary, @remote)
  `);
  const insertMany = db.transaction((list) => {
    for (const job of list) insert.run(job);
  });
  insertMany(jobs);
}

function getUnseenJobs(limit = 50) {
  return db.prepare(`
    SELECT j.* FROM jobs j
    LEFT JOIN seen_jobs s ON j.id = s.job_id
    WHERE s.job_id IS NULL
    ORDER BY j.fetched_at DESC
    LIMIT ?
  `).all(limit);
}

function markJobsSeen(jobIds) {
  const insert = db.prepare("INSERT OR IGNORE INTO seen_jobs (job_id) VALUES (?)");
  const tx = db.transaction((ids) => { for (const id of ids) insert.run(id); });
  tx(jobIds);
}

function getRecentJobs(limit = 20) {
  return db.prepare(`
    SELECT * FROM jobs ORDER BY fetched_at DESC LIMIT ?
  `).all(limit);
}

// ── Digests ──────────────────────────────────────────────────

function saveDigest(content, jobCount) {
  db.prepare("INSERT INTO digests (content, job_count) VALUES (?, ?)").run(content, jobCount);
}

function getLastDigest() {
  return db.prepare("SELECT * FROM digests ORDER BY sent_at DESC LIMIT 1").get();
}

module.exports = {
  db,
  getProfile,
  saveProfile,
  upsertJobs,
  getUnseenJobs,
  markJobsSeen,
  getRecentJobs,
  saveDigest,
  getLastDigest,
};
