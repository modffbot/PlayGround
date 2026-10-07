'use strict';
/* MODYX AI - Auth (JWT + bcrypt, no plaintext passwords) */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { db } = require('./db');

const SECRET = process.env.AUTH_SECRET || 'dev-secret-change-me-please-32chars!!';
if (!SECRET || SECRET.length < 16) console.warn('[auth] AUTH_SECRET is weak — set a long secret in .env');

function sign(user) {
  const jti = crypto.randomUUID();
  try {
    db.prepare('INSERT INTO sessions(id,user_id,jti,ua,ip) VALUES(?,?,?, ?, ?)').run(crypto.randomUUID(), user.id, jti, '', '');
  } catch {}
  return jwt.sign({ id: user.id, email: user.email, role: user.role, jti }, SECRET, { expiresIn: '7d' });
}
function adminPassOk(pass) {
  const hash = process.env.ADMIN_PASSWORD_HASH || '';
  if (hash) { try { return bcrypt.compareSync(String(pass || ''), hash); } catch { return false; } }
  const plain = process.env.ADMIN_PASSWORD || '';
  if (plain) return String(pass || '') === plain;
  return false;
}
function authRequired(req, res, next) {
  const fromCookie = req.headers.cookie?.match(/modyx_token=([^;]+)/)?.[1];
  const hdr = req.headers.authorization?.replace('Bearer ', '');
  const token = hdr || (fromCookie ? decodeURIComponent(fromCookie) : null);
  if (!token) return res.status(401).json({ error: 'غير مسجل الدخول' });
  try {
    const p = jwt.verify(token, SECRET);
    if (p.jti) {
      try {
        const s = db.prepare('SELECT revoked FROM sessions WHERE jti=?').get(p.jti);
        if (s && s.revoked) return res.status(401).json({ error: 'تم تسجيل الخروج من هذه الجلسة' });
        db.prepare('UPDATE sessions SET last_seen=datetime(\'now\') WHERE jti=?').run(p.jti);
      } catch {}
    }
    const user = db.prepare('SELECT id,name,email,avatar,role,blocked,plan,plan_expires,credits,totp_enabled,lang,theme,bg_url,bg_opacity,created_at FROM users WHERE id=?').get(p.id);
    if (!user) return res.status(401).json({ error: 'حساب غير موجود' });
    if (user.blocked) return res.status(403).json({ error: 'تم حظر حسابك — تواصل مع الإدارة' });
    // lazy downgrade of expired paid plans
    if (user.plan && user.plan !== 'free' && user.plan_expires && user.plan_expires < new Date().toISOString().slice(0, 10)) {
      db.prepare("UPDATE users SET plan='free',plan_expires='' WHERE id=?").run(user.id);
      user.plan = 'free'; user.plan_expires = '';
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'جلسة منتهية — سجل الدخول مجددًا' });
  }
}
function adminRequired(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'غير مصرح' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'صلاحيات مدير فقط' });
  next();
}
function adminLog(adminId, action, detail = '') {
  db.prepare('INSERT INTO admin_logs(admin_id,action,detail) VALUES(?,?,?)').run(adminId, action, String(detail).slice(0, 2000));
}

function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'admin@modyx.ai').toLowerCase();
  const pass = process.env.ADMIN_PASSWORD || 'Admin123!';
  const exists = db.prepare('SELECT id FROM users WHERE email=?').get(email);
  if (!exists) {
    const id = crypto.randomUUID();
    const hash = bcrypt.hashSync(pass, 10);
    db.prepare('INSERT INTO users(id,name,email,password_hash,role) VALUES(?,?,?,?,?)')
      .run(id, process.env.ADMIN_NAME || 'MODYX Admin', email, hash, 'admin');
    console.log(`[seed] admin created: ${email}`);
  }
}

module.exports = { sign, authRequired, adminRequired, adminLog, seedAdmin, adminPassOk };
