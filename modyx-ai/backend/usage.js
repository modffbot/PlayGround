'use strict';
/* MODYX AI - Usage limits (per-plan, editable from Admin Panel) */
const { db, getSetting } = require('./db');

function today() { return new Date().toISOString().slice(0, 10); }
function planOf(userId) {
  try {
    const r = db.prepare('SELECT plan FROM users WHERE id=?').get(userId);
    return (['pro', 'vip', 'developer', 'team'].includes(r?.plan)) ? r.plan : 'free';
  } catch { return 'free'; }
}
function planLimits(plan) {
  if (plan === 'pro') return {
    messages: Number(getSetting('limit_pro_messages', '1000')),
    files: Number(getSetting('limit_pro_files', '200')),
    searches: Number(getSetting('limit_pro_searches', '300')),
  };
  if (plan === 'vip') return {
    messages: Number(getSetting('limit_vip_messages', '5000')),
    files: Number(getSetting('limit_vip_files', '1000')),
    searches: Number(getSetting('limit_vip_searches', '1000')),
  };
  if (plan === 'developer') return {
    messages: Number(getSetting('limit_dev_messages', '2000')),
    files: Number(getSetting('limit_dev_files', '500')),
    searches: Number(getSetting('limit_dev_searches', '500')),
  };
  if (plan === 'team') return {
    messages: Number(getSetting('limit_team_messages', '10000')),
    files: Number(getSetting('limit_team_files', '2000')),
    searches: Number(getSetting('limit_team_searches', '2000')),
  };
  return {
    messages: Number(getSetting('daily_messages_limit', '100')),
    files: Number(getSetting('daily_files_limit', '20')),
    searches: Number(getSetting('daily_search_limit', '30')),
  };
}

function getUsage(userId) {
  const d = today();
  let row = db.prepare('SELECT * FROM usage WHERE user_id=? AND day=?').get(userId, d);
  if (!row) {
    db.prepare('INSERT INTO usage(user_id,day) VALUES(?,?)').run(userId, d);
    row = db.prepare('SELECT * FROM usage WHERE user_id=? AND day=?').get(userId, d);
  }
  const plan = planOf(userId);
  return { ...row, plan, limits: planLimits(plan) };
}
function bump(userId, field) {
  const d = today();
  getUsage(userId);
  if (!['messages', 'files', 'searches', 'images'].includes(field)) return;
  db.prepare(`UPDATE usage SET ${field}=${field}+1 WHERE user_id=? AND day=?`).run(userId, d);
}
function checkLimit(userId, field) {
  const u = getUsage(userId);
  const map = { messages: 'messages', files: 'files', searches: 'searches', images: 'messages' };
  const limitKey = { messages: 'messages', files: 'files', searches: 'searches', images: 'messages' }[field] || 'messages';
  const limit = u.limits[limitKey] ?? 100;
  return { ok: (u[map[field]] || 0) < limit, used: u[map[field]] || 0, limit, plan: u.plan };
}

module.exports = { getUsage, bump, checkLimit, planOf, planLimits };
