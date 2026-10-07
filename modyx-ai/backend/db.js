'use strict';
/* MODYX AI - Database layer (SQLite via built-in node:sqlite, file-backed, scalable schema) */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let dbPath = path.join(dataDir, 'modyx.db');
const durl = process.env.DATABASE_URL || '';
if (durl.startsWith('sqlite:')) {
  const p = durl.slice('sqlite:'.length);
  dbPath = path.isAbsolute(p) ? p : path.join(__dirname, '..', p);
}

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  avatar TEXT DEFAULT '',
  role TEXT DEFAULT 'user',
  blocked INTEGER DEFAULT 0,
  lang TEXT DEFAULT 'ar',
  theme TEXT DEFAULT 'dark',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT DEFAULT 'محادثة جديدة',
  model TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  meta TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  conversation_id TEXT DEFAULT '',
  original_name TEXT,
  stored_name TEXT,
  mime TEXT,
  size INTEGER DEFAULT 0,
  kind TEXT DEFAULT 'other',
  text_preview TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  messages INTEGER DEFAULT 0,
  files INTEGER DEFAULT 0,
  searches INTEGER DEFAULT 0,
  images INTEGER DEFAULT 0,
  UNIQUE(user_id, day)
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT DEFAULT 'all',
  title TEXT,
  body TEXT,
  kind TEXT DEFAULT 'info',
  read_by TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS admin_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id TEXT,
  action TEXT,
  detail TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id);
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')),
  decided_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  fact TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
/* ===== MODYX v2 schema ===== */
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, jti TEXT UNIQUE NOT NULL,
  ua TEXT DEFAULT '', ip TEXT DEFAULT '', revoked INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')), last_seen TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL,
  description TEXT DEFAULT '', priority TEXT DEFAULT 'normal', status TEXT DEFAULT 'pending',
  deadline TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, prompt TEXT NOT NULL,
  schedule TEXT DEFAULT '', repeat TEXT DEFAULT 'once', enabled INTEGER DEFAULT 1,
  start_date TEXT DEFAULT '', end_date TEXT DEFAULT '',
  last_run TEXT DEFAULT '', next_run TEXT DEFAULT '', history TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, team_id TEXT DEFAULT '', title TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS project_notes (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT DEFAULT 'ملاحظة', body TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS custom_ai (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, avatar TEXT DEFAULT '🤖',
  instructions TEXT DEFAULT '', personality TEXT DEFAULT '', tools TEXT DEFAULT '',
  model TEXT DEFAULT '', visibility TEXT DEFAULT 'private',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS kb_collections (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS kb_docs (
  id TEXT PRIMARY KEY, collection_id TEXT NOT NULL, filename TEXT NOT NULL, text TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS image_history (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, prompt TEXT NOT NULL, url TEXT NOT NULL,
  via TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL, body TEXT DEFAULT '',
  category TEXT DEFAULT 'عام', fav INTEGER DEFAULT 0, visibility TEXT DEFAULT 'private',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS prompt_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, prompt_id TEXT NOT NULL, v INTEGER NOT NULL,
  body TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS marketplace_items (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, kind TEXT NOT NULL, ref_id TEXT DEFAULT '',
  title TEXT NOT NULL, body TEXT DEFAULT '', visibility TEXT DEFAULT 'public',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY, item_id TEXT NOT NULL, user_id TEXT NOT NULL, rating INTEGER DEFAULT 5,
  comment TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(item_id, user_id)
);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY, item_id TEXT NOT NULL, user_id TEXT NOT NULL, reason TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS team_members (
  team_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT DEFAULT 'member',
  PRIMARY KEY(team_id, user_id)
);
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, hash TEXT NOT NULL,
  prefix TEXT DEFAULT '', scopes TEXT DEFAULT 'chat', daily_limit INTEGER DEFAULT 100,
  monthly_limit INTEGER DEFAULT 2000, status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS api_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT, key_id TEXT NOT NULL, day TEXT NOT NULL,
  month TEXT NOT NULL, count INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS api_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, key_id TEXT NOT NULL, endpoint TEXT DEFAULT '',
  status INTEGER DEFAULT 200, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, url TEXT NOT NULL, secret TEXT DEFAULT '',
  events TEXT DEFAULT '[]', enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT, webhook_id TEXT NOT NULL, event TEXT DEFAULT '',
  code INTEGER DEFAULT 0, ok INTEGER DEFAULT 0, attempts INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS credit_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, amount INTEGER NOT NULL,
  reason TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL, code TEXT UNIQUE NOT NULL,
  invites INTEGER DEFAULT 0, successful INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY, message_id TEXT NOT NULL, user_id TEXT NOT NULL,
  rating INTEGER NOT NULL, comment TEXT DEFAULT '', model TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY, enabled INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS backups (
  id TEXT PRIMARY KEY, filename TEXT NOT NULL, size INTEGER DEFAULT 0, status TEXT DEFAULT 'ok',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS admin_attempts (
  ip TEXT PRIMARY KEY, count INTEGER DEFAULT 0, locked_until TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS push_subs (
  user_id TEXT PRIMARY KEY, sub TEXT DEFAULT '', enabled INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, plan TEXT NOT NULL, method TEXT NOT NULL,
  amount TEXT DEFAULT '', tx TEXT DEFAULT '', status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')), decided_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS ads (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT DEFAULT '', image_url TEXT DEFAULT '',
  link TEXT DEFAULT '', placement TEXT DEFAULT 'chat', enabled INTEGER DEFAULT 1,
  impressions INTEGER DEFAULT 0, clicks INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS telegram_links (
  code TEXT PRIMARY KEY, user_id TEXT NOT NULL,
  expires TEXT DEFAULT (datetime('now', '+15 minutes'))
);
CREATE TABLE IF NOT EXISTS telegram_users (
  user_id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, username TEXT DEFAULT ''
);
`);
// lightweight migrations for existing DBs
for (const sql of [
  "ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free'",
  "ALTER TABLE users ADD COLUMN plan_expires TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN credits INTEGER DEFAULT 1000",
  "ALTER TABLE users ADD COLUMN referral_code TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN totp_secret TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN totp_enabled INTEGER DEFAULT 0",
  "ALTER TABLE users ADD COLUMN github_token TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN google_id TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN bg_url TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN bg_opacity TEXT DEFAULT '0.25'",
  "ALTER TABLE conversations ADD COLUMN archived INTEGER DEFAULT 0",
  "ALTER TABLE conversations ADD COLUMN pinned INTEGER DEFAULT 0",
  "ALTER TABLE conversations ADD COLUMN shared_token TEXT DEFAULT ''",
  "ALTER TABLE conversations ADD COLUMN team_id TEXT DEFAULT ''",
  "ALTER TABLE conversations ADD COLUMN project_id TEXT DEFAULT ''",
  "ALTER TABLE conversations ADD COLUMN mode TEXT DEFAULT 'smart'",
  "ALTER TABLE conversations ADD COLUMN branch_from TEXT DEFAULT ''",
]) {
  try { db.exec(sql); } catch { /* column already exists */ }
}

function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key=?').get(key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value));
}
// seed defaults
const defaults = {
  daily_messages_limit: process.env.DAILY_MESSAGES_LIMIT || '100',
  daily_files_limit: process.env.DAILY_FILES_LIMIT || '20',
  daily_search_limit: process.env.DAILY_SEARCH_LIMIT || '30',
  max_upload_mb: process.env.MAX_UPLOAD_MB || '15',
  announcement: '',
  ai_provider: process.env.AI_PROVIDER || 'mock',
  ai_model: process.env.AI_MODEL || 'modyx-mock-1',
  plan_pro_price: '49',
  plan_vip_price: '99',
  plan_currency: 'ج.م/شهريًا',
  payment_instructions: 'للاشتراك: حوّل المبلغ ثم تواصل عبر Telegram @MODYXBOT1 برقم حسابك، واضغط زر (اشترك الآن) وسنفعّل خطتك خلال ساعات.',
  limit_pro_messages: '1000',
  limit_pro_files: '200',
  limit_pro_searches: '300',
  limit_vip_messages: '5000',
  limit_vip_files: '1000',
  limit_vip_searches: '1000',
  plan_dev_price: '149',
  plan_team_price: '299',
  limit_dev_messages: '2000',
  limit_dev_files: '500',
  limit_dev_searches: '500',
  limit_team_messages: '10000',
  limit_team_files: '2000',
  limit_team_searches: '2000',
  credit_signup_bonus: '1000',
  credit_cost_message: '1',
  credit_cost_image: '10',
  credit_cost_research: '5',
  credit_referral_reward: '200',
  credits_enabled: '1',
  totp_issuer: 'MODYX AI',
  brand_name: 'MODYX AI',
  brand_emoji: '⚡',
  brand_accent: '',
  ads_enabled: '1',
  pay_vodafone_number: '',
  pay_instapay_handle: '',
  stripe_public_key: '',
};
for (const [k, v] of Object.entries(defaults)) {
  if (getSetting(k, null) === null) setSetting(k, v);
}
// seed feature flags
for (const f of ['image', 'research', 'agents', 'github', 'marketplace', 'voice', 'api', 'webhooks', 'teams', 'docs']) {
  try { db.prepare('INSERT OR IGNORE INTO feature_flags(key,enabled) VALUES(?,1)').run(f); } catch {}
}

module.exports = { db, getSetting, setSetting };
