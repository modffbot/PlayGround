'use strict';
/* MODYX AI v2 - Pro modules: research, agents, tasks, scheduler, workspace, custom AI,
   knowledge RAG, images, docs studio, sandbox, prompts v2, compare, github, API platform,
   webhooks, marketplace, teams, credits/referrals, push, universal search, admin ops. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const rateLimit = require('express-rate-limit');
const { db, getSetting, setSetting } = require('./db');
const { authRequired, adminRequired, adminLog } = require('./auth');
const { chatComplete, capabilities } = require('./ai-provider');
const { webSearch } = require('./search');
const { bump } = require('./usage');

const uid = () => crypto.randomUUID();
const sse = (res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  return (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
};
const limiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
function flagOn(key) {
  try { return db.prepare('SELECT enabled FROM feature_flags WHERE key=?').get(key)?.enabled === 1; }
  catch { return true; }
}
function needFlag(key) {
  return (req, res, next) => {
    if (!flagOn(key)) return res.status(403).json({ error: `ميزة ${key} متوقفة من الإدارة (Feature Flag).` });
    next();
  };
}

/* ---------- webhooks emit ---------- */
async function deliverWh(w, event, data) {
  const payload = JSON.stringify({ event, data, at: new Date().toISOString() });
  const sig = w.secret ? crypto.createHmac('sha256', w.secret).update(payload).digest('hex') : '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await fetch(w.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-modyx-event': event, 'x-modyx-signature': sig }, body: payload, signal: AbortSignal.timeout(8000) });
      db.prepare('INSERT INTO webhook_deliveries(webhook_id,event,code,ok,attempts) VALUES(?,?,?,?,?)').run(w.id, event, r.status, r.ok ? 1 : 0, attempt);
      if (r.ok) return true;
    } catch {
      db.prepare('INSERT INTO webhook_deliveries(webhook_id,event,code,ok,attempts) VALUES(?,?,?,?,?)').run(w.id, event, 0, 0, attempt);
    }
  }
  return false;
}
async function emitEvent(event, userId, data = {}) {
  try {
    const hooks = db.prepare('SELECT * FROM webhooks WHERE user_id=? AND enabled=1').all(userId);
    const evs = (w) => { try { return JSON.parse(w.events || '[]'); } catch { return []; } };
    for (const w of hooks.filter(w => evs(w).includes(event) || evs(w).includes('*'))) deliverWh(w, event, data);
  } catch {}
}

/* ---------- scheduler ---------- */
function sqlDT(d) { return new Date(d).toISOString().slice(0, 19).replace('T', ' '); }
function computeNext(sched, repeat) {
  const now = new Date();
  if (repeat === 'daily') {
    const m = String(sched || '').match(/(\d{1,2}):(\d{2})/);
    const d = new Date(now);
    if (m) { d.setHours(Number(m[1]), Number(m[2]), 0, 0); if (d <= now) d.setDate(d.getDate() + 1); }
    else d.setDate(d.getDate() + 1);
    return sqlDT(d);
  }
  if (repeat === 'once' && sched) { const d = new Date(sched); return isNaN(d) ? '' : sqlDT(d); }
  return '';
}
/* ---------- morning briefing (real weather via Open-Meteo + news + tasks) ---------- */
async function buildBriefing(city, user) {
  let lat = 30.0444, lon = 31.2357, name = city || 'القاهرة';
  try {
    const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city || 'القاهرة')}&count=1&language=ar`, { signal: AbortSignal.timeout(8000) }).then(r => r.json());
    if (g.results?.[0]) { lat = g.results[0].latitude; lon = g.results[0].longitude; name = g.results[0].name; }
  } catch {}
  let wx = 'تعذر جلب الطقس';
  try {
    const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m&daily=temperature_2m_max,temperature_2m_min&timezone=auto`, { signal: AbortSignal.timeout(8000) }).then(r => r.json());
    wx = `${name}: الآن ${w.current?.temperature_2m}°م، العظمى ${w.daily?.temperature_2m_max?.[0]}°م / الصغرى ${w.daily?.temperature_2m_min?.[0]}°م`;
  } catch {}
  let news = [];
  try { const n = await webSearch('آخر الأخبار اليوم'); news = n.results.slice(0, 4); bump(user.id, 'searches'); } catch {}
  const tasks = db.prepare("SELECT title FROM tasks WHERE user_id=? AND status IN ('pending','running') LIMIT 5").all(user.id);
  const r = await chatComplete({ messages: [{ role: 'system', content: 'أنت المساعد الصباحي. من المعطيات أنشئ بريف صباحي عربي منظم ومختصر: 🌤️ الطقس، 📰 أهم خبرين، ✅ مهام اليوم.' }, { role: 'user', content: `الطقس: ${wx}\nأخبار: ${news.map(x => x.title + ' — ' + String(x.snippet || '').slice(0, 150)).join('\n')}\nمهامي: ${tasks.map(t => t.title).join('، ') || 'لا مهام'}` }], lang: user.lang || 'ar' });
  return r.text;
}
async function runScheduled(st) {
  try {
    let text;
    if (String(st.prompt || '').startsWith('BRIEFING:')) {
      const u = db.prepare('SELECT lang FROM users WHERE id=?').get(st.user_id) || { lang: 'ar' };
      text = await buildBriefing(st.prompt.slice(9).trim() || 'القاهرة', { id: st.user_id, lang: u.lang });
    } else {
      const r = await chatComplete({ messages: [{ role: 'system', content: 'أنت منفذ مهام مجدولة في MODYX AI. نفذ المطلوب باختصار منظم.' }, { role: 'user', content: st.prompt }], lang: 'ar' });
      text = r.text;
    }
    const hist = (() => { try { return JSON.parse(st.history || '[]'); } catch { return []; } })();
    hist.unshift({ at: new Date().toISOString(), result: text.slice(0, 2000) });
    db.prepare('UPDATE scheduled_tasks SET history=?,last_run=datetime(\'now\') WHERE id=?').run(JSON.stringify(hist.slice(0, 20)), st.id);
    db.prepare('INSERT INTO notifications(id,user_id,title,body,kind) VALUES(?,?,?,?,?)').run(uid(), st.user_id, `⏰ مهمة مجدولة: ${st.title}`, text.slice(0, 500), 'task');
  } catch (e) { /* keep scheduler alive */ }
  const nx = st.repeat === 'daily' ? computeNext(st.schedule, 'daily') : '';
  db.prepare('UPDATE scheduled_tasks SET next_run=?, enabled=? WHERE id=?').run(nx, st.repeat === 'daily' && nx ? 1 : 0, st.id);
}
async function runDueTasks() {
  let ran = 0;
  try {
    const due = db.prepare("SELECT * FROM scheduled_tasks WHERE enabled=1 AND next_run<>'' AND next_run<=datetime('now')").all();
    for (const st of due) {
      if (st.end_date && st.end_date < new Date().toISOString().slice(0, 10)) { db.prepare('UPDATE scheduled_tasks SET enabled=0 WHERE id=?').run(st.id); continue; }
      await runScheduled(st);
      ran++;
    }
  } catch {}
  return ran;
}
function startScheduler() {
  try {
    const t = setInterval(runDueTasks, 30000);
    if (t.unref) t.unref(); // don't hold the event loop (tests + serverless)
  } catch {}
}

/* ---------- knowledge RAG (keyword, honest) ---------- */
function kbSearch(collectionId, query, top = 3) {
  const docs = db.prepare('SELECT filename,text FROM kb_docs WHERE collection_id=?').all(collectionId);
  const toks = String(query).split(/[\s،,.!?؛:()«»"']+/).map(s => s.trim()).filter(s => s.length > 2);
  const scored = docs.map(d => {
    let score = 0;
    for (const t of toks) { const c = (d.text.match(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length; score += c; }
    return { ...d, score };
  }).filter(d => d.score > 0).sort((a, b) => b.score - a.score).slice(0, top);
  return scored;
}

/* ---------- GitHub proxy (user PAT, minimal scopes) ---------- */
async function gh(token, pathApi) {
  const r = await fetch(`https://api.github.com${pathApi}`, { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  return r.json();
}

/* ---------- agent jobs (in-memory, stoppable) ---------- */
const jobs = new Map();

function mountPro(app) {
  /* flags (public) */
  app.get('/api/flags', (req, res) => {
    res.json({ flags: Object.fromEntries(db.prepare('SELECT key,enabled FROM feature_flags').all().map(r => [r.key, !!r.enabled])) });
  });

  /* developer documentation (grows with the API) */
  app.get('/api/docs', (req, res) => res.json({
    title: 'MODYX API — Developer Documentation',
    quickstart: ['1) أنشئ مفتاحًا من تبويب API Platform', '2) أرسل x-api-key في الترويسة', '3) POST /api/v1/chat {message}'],
    authentication: 'ترويسة x-api-key. الـSecret يُعرض مرة واحدة فقط عند الإنشاء.',
    reference: [
      { method: 'GET', path: '/api/v1/models', desc: 'النماذج المتاحة' },
      { method: 'POST', path: '/api/v1/chat', desc: '{message} → {reply, mode}' },
    ],
    errors: ['401 مفتاح غير صالح', '429 تجاوز الحد اليومي/الشهري للمفتاح', '400 مدخلات ناقصة'],
    limits: 'لكل مفتاح حد يومي وشهري قابل للضبط من لوحة API.',
    webhooks: 'أنشئ Webhook بحدث واحد أو * ثم زر اختبار — التوقيع x-modyx-signature (HMAC-SHA256).',
    sdks: ['/sdk/modyx.js — MODYX SDK for JavaScript', '/sdk/modyx.py — MODYX SDK for Python'],
  }));

  /* ---------- deep research SSE ---------- */
  app.post('/api/research', authRequired, limiter, needFlag('research'), async (req, res) => {
    const q = String(req.body?.question || '').slice(0, 500);
    if (!q) return res.status(400).json({ error: 'اكتب سؤال البحث' });
    const send = sse(res);
    const steps = [];
    const log = (step, detail) => { steps.push({ step, detail }); send({ step, detail, progress: Math.min(95, steps.length * 18) }); };
    try {
      log('plan', 'تحليل السؤال وتقسيم المهمة...');
      const plan = await chatComplete({ messages: [{ role: 'system', content: 'قسم سؤال البحث التالي إلى 3 محاور بحث قصيرة (سطر لكل محور).' }, { role: 'user', content: q }], lang: req.user.lang });
      const axes = plan.text.split('\n').map(s => s.replace(/^[\d\-\.\s]+/, '').trim()).filter(Boolean).slice(0, 3);
      log('axes', axes);
      const all = [];
      for (let i = 0; i < Math.max(1, axes.length); i++) {
        log('search', `البحث في مصادر متعددة (${i + 1}/${Math.max(1, axes.length)})...`);
        const out = await webSearch(`${q} ${axes[i] || ''}`.trim());
        bump(req.user.id, 'searches');
        all.push(...out.results);
      }
      log('compare', 'مقارنة المعلومات من المصادر...');
      const seen = new Map();
      for (const r of all) if (r.url && !seen.has(r.url)) seen.set(r.url, r);
      const src = [...seen.values()].slice(0, 8);
      const ctx = src.map((r, i) => `[${i + 1}] ${r.title} (${r.source}): ${String(r.snippet || '').slice(0, 300)} — ${r.url}`).join('\n');
      log('report', 'تلخيص النتائج وإنشاء التقرير...');
      const rep = await chatComplete({ messages: [{ role: 'system', content: 'أنت MODYX Deep Research. أنشئ تقريرًا منظمًا: الخلاصة التنفيذية، التفاصيل، المقارنة، الاستنتاج والتوصيات. ضع رقم المصدر [n] بجانب كل معلومة خارجية. اذكر بوضوح أن المعلومات المبنية على مصادر خارجية مرقمة، وما عداها معرفة عامة. لا تخترع مصادر.' }, { role: 'user', content: `السؤال: ${q}\nالمصادر:\n${ctx || 'لا مصادر خارجية'}` }], lang: req.user.lang });
      bump(req.user.id, 'messages');
      send({ done: true, progress: 100, report: rep.text, sources: src, question: q });
    } catch (e) { send({ error: e.message }); }
    res.end();
  });

  /* ---------- multi-agent SSE ---------- */
  app.post('/api/agents', authRequired, limiter, needFlag('agents'), async (req, res) => {
    const task = String(req.body?.task || '').slice(0, 2000);
    if (!task) return res.status(400).json({ error: 'اكتب المهمة' });
    const id = uid();
    const job = { stopped: false };
    jobs.set(id, job);
    const send = sse(res);
    send({ job: id, progress: 2 });
    const stop = () => job.stopped;
    try {
      const isCode = /كود|code|برنامج|دالة|function|script|api|موقع/i.test(task);
      send({ agent: 'research', status: 'running', progress: 15, log: 'Research Agent يحلل المهمة...' });
      const plan = await chatComplete({ messages: [{ role: 'system', content: 'Research Agent: حلل المهمة وقسمها لخطوات تنفيذية مرقمة.' }, { role: 'user', content: task }], lang: req.user.lang });
      if (stop()) return send({ stopped: true });
      send({ agent: 'research', status: 'done', progress: 30, result: plan.text });
      send({ agent: isCode ? 'coding' : 'writer', status: 'running', progress: 45, log: 'Agent التنفيذ يعمل...' });
      const exec = await chatComplete({ messages: [{ role: 'system', content: isCode ? 'Coding Agent: نفذ المطلوب ككود نظيف + شرح.' : 'Writer Agent: نفذ المطلوب كنص احترافي منظم.' }, { role: 'user', content: `المهمة: ${task}\nالخطة:\n${plan.text}` }], task: isCode ? 'code_generate' : undefined, lang: req.user.lang });
      if (stop()) return send({ stopped: true });
      send({ agent: isCode ? 'coding' : 'writer', status: 'done', progress: 70, result: exec.text });
      send({ agent: 'analyzer', status: 'running', progress: 80, log: 'Analyzer Agent يفحص الجودة...' });
      const rev = await chatComplete({ messages: [{ role: 'system', content: 'Reviewer/Analyzer Agent: راجع النتيجة (أخطاء + تحسينات) باختصار.' }, { role: 'user', content: exec.text.slice(0, 3000) }], lang: req.user.lang });
      if (stop()) return send({ stopped: true });
      bump(req.user.id, 'messages');
      send({ done: true, progress: 100, final: exec.text, review: rev.text, steps: { plan: plan.text } });
    } catch (e) { send({ error: e.message }); }
    jobs.delete(id);
    res.end();
  });
  app.post('/api/agents/:id/stop', authRequired, (req, res) => {
    const j = jobs.get(req.params.id);
    if (j) j.stopped = true;
    res.json({ ok: true, stopped: !!j });
  });

  /* ---------- tasks ---------- */
  app.get('/api/tasks', authRequired, (req, res) => res.json({ tasks: db.prepare('SELECT * FROM tasks WHERE user_id=? ORDER BY created_at DESC').all(req.user.id) }));
  app.post('/api/tasks', authRequired, (req, res) => {
    const { title, description, priority, deadline } = req.body || {};
    if (!title?.trim()) return res.status(400).json({ error: 'عنوان المهمة مطلوب' });
    const id = uid();
    db.prepare('INSERT INTO tasks(id,user_id,title,description,priority,deadline) VALUES(?,?,?,?,?,?)').run(id, req.user.id, String(title).slice(0, 120), String(description || '').slice(0, 2000), priority || 'normal', deadline || '');
    res.json({ ok: true, id });
  });
  app.put('/api/tasks/:id', authRequired, (req, res) => {
    const { title, description, priority, status, deadline } = req.body || {};
    if (status && !['pending', 'running', 'completed', 'failed', 'paused'].includes(status)) return res.status(400).json({ error: 'حالة غير صالحة' });
    db.prepare('UPDATE tasks SET title=COALESCE(?,title),description=COALESCE(?,description),priority=COALESCE(?,priority),status=COALESCE(?,status),deadline=COALESCE(?,deadline) WHERE id=? AND user_id=?')
      .run(title ?? null, description ?? null, priority ?? null, status ?? null, deadline ?? null, req.params.id, req.user.id);
    res.json({ ok: true });
  });
  app.delete('/api/tasks/:id', authRequired, (req, res) => { db.prepare('DELETE FROM tasks WHERE id=? AND user_id=?').run(req.params.id, req.user.id); res.json({ ok: true }); });

  /* ---------- scheduled ---------- */
  app.get('/api/scheduled', authRequired, (req, res) => res.json({ tasks: db.prepare('SELECT * FROM scheduled_tasks WHERE user_id=? ORDER BY created_at DESC').all(req.user.id) }));
  app.post('/api/scheduled', authRequired, (req, res) => {
    const { title, prompt, schedule, repeat, start_date, end_date } = req.body || {};
    if (!title?.trim() || !prompt?.trim()) return res.status(400).json({ error: 'العنوان والأمر مطلوبان' });
    const id = uid();
    db.prepare('INSERT INTO scheduled_tasks(id,user_id,title,prompt,schedule,repeat,start_date,end_date,next_run) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id, req.user.id, String(title).slice(0, 120), String(prompt).slice(0, 2000), schedule || '', repeat || 'once', start_date || '', end_date || '', computeNext(schedule, repeat || 'once'));
    res.json({ ok: true, id });
  });
  app.put('/api/scheduled/:id', authRequired, (req, res) => {
    const t = db.prepare('SELECT * FROM scheduled_tasks WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!t) return res.status(404).json({ error: 'غير موجود' });
    const { title, prompt, schedule, repeat, enabled, start_date, end_date } = req.body || {};
    const ns = schedule ?? t.schedule, nr = repeat ?? t.repeat;
    db.prepare('UPDATE scheduled_tasks SET title=COALESCE(?,title),prompt=COALESCE(?,prompt),schedule=?,repeat=?,enabled=COALESCE(?,enabled),start_date=COALESCE(?,start_date),end_date=COALESCE(?,end_date),next_run=? WHERE id=?')
      .run(title ?? null, prompt ?? null, ns ?? null, nr ?? null, enabled ?? null, start_date ?? null, end_date ?? null, computeNext(ns, nr), t.id);
    res.json({ ok: true });
  });
  app.delete('/api/scheduled/:id', authRequired, (req, res) => { db.prepare('DELETE FROM scheduled_tasks WHERE id=? AND user_id=?').run(req.params.id, req.user.id); res.json({ ok: true }); });
  app.post('/api/scheduled/:id/run', authRequired, limiter, async (req, res) => {
    const t = db.prepare('SELECT * FROM scheduled_tasks WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!t) return res.status(404).json({ error: 'غير موجود' });
    await runScheduled(t);
    res.json({ ok: true });
  });

  /* ---------- workspace: projects + notes ---------- */
  app.get('/api/projects', authRequired, (req, res) => {
    const myTeams = db.prepare('SELECT team_id FROM team_members WHERE user_id=?').all(req.user.id).map(r => r.team_id);
    let list = db.prepare('SELECT * FROM projects WHERE owner_id=? ORDER BY created_at DESC').all(req.user.id);
    if (myTeams.length) list = list.concat(db.prepare(`SELECT * FROM projects WHERE team_id IN (${myTeams.map(() => '?').join(',')})`).all(...myTeams));
    res.json({ projects: list });
  });
  app.post('/api/projects', authRequired, (req, res) => {
    const { title, team_id } = req.body || {};
    if (!title?.trim()) return res.status(400).json({ error: 'اسم المشروع مطلوب' });
    const id = uid();
    db.prepare('INSERT INTO projects(id,owner_id,team_id,title) VALUES(?,?,?,?)').run(id, req.user.id, team_id || '', String(title).slice(0, 100));
    res.json({ ok: true, id });
  });
  app.delete('/api/projects/:id', authRequired, (req, res) => { db.prepare('DELETE FROM projects WHERE id=? AND owner_id=?').run(req.params.id, req.user.id); res.json({ ok: true }); });
  app.get('/api/projects/:id/notes', authRequired, (req, res) => res.json({ notes: db.prepare('SELECT * FROM project_notes WHERE project_id=? ORDER BY updated_at DESC').all(req.params.id) }));
  app.post('/api/projects/:id/notes', authRequired, (req, res) => {
    const { title, body } = req.body || {};
    const id = uid();
    db.prepare('INSERT INTO project_notes(id,project_id,title,body) VALUES(?,?,?,?)').run(id, req.params.id, String(title || 'ملاحظة').slice(0, 100), String(body || '').slice(0, 20000));
    res.json({ ok: true, id });
  });
  app.put('/api/notes/:id', authRequired, (req, res) => {
    db.prepare("UPDATE project_notes SET title=COALESCE(?,title),body=COALESCE(?,body),updated_at=datetime('now') WHERE id=?").run(req.body?.title ?? null, req.body?.body ?? null, req.params.id);
    res.json({ ok: true });
  });
  app.delete('/api/notes/:id', authRequired, (req, res) => { db.prepare('DELETE FROM project_notes WHERE id=?').run(req.params.id); res.json({ ok: true }); });

  /* ---------- custom AI ---------- */
  app.get('/api/assistants', authRequired, (req, res) => {
    res.json({ assistants: db.prepare("SELECT * FROM custom_ai WHERE owner_id=? OR visibility='public' ORDER BY created_at DESC").all(req.user.id) });
  });
  app.post('/api/assistants', authRequired, (req, res) => {
    const { name, avatar, instructions, personality, tools, model, visibility } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'اسم المساعد مطلوب' });
    const id = uid();
    db.prepare('INSERT INTO custom_ai(id,owner_id,name,avatar,instructions,personality,tools,model,visibility) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id, req.user.id, String(name).slice(0, 60), String(avatar || '🤖').slice(0, 10), String(instructions || '').slice(0, 3000), String(personality || '').slice(0, 1000), String(tools || '').slice(0, 500), String(model || '').slice(0, 100), visibility === 'public' ? 'public' : 'private');
    res.json({ ok: true, id });
  });
  app.delete('/api/assistants/:id', authRequired, (req, res) => { db.prepare('DELETE FROM custom_ai WHERE id=? AND owner_id=?').run(req.params.id, req.user.id); res.json({ ok: true }); });

  /* ---------- knowledge base (RAG keyword) ---------- */
  app.get('/api/kb', authRequired, (req, res) => res.json({ collections: db.prepare('SELECT * FROM kb_collections WHERE owner_id=? ORDER BY created_at DESC').all(req.user.id) }));
  app.post('/api/kb', authRequired, (req, res) => {
    if (!req.body?.title?.trim()) return res.status(400).json({ error: 'اسم المجموعة مطلوب' });
    const id = uid();
    db.prepare('INSERT INTO kb_collections(id,owner_id,title) VALUES(?,?,?)').run(id, req.user.id, String(req.body.title).slice(0, 100));
    res.json({ ok: true, id });
  });
  app.delete('/api/kb/:id', authRequired, (req, res) => {
    db.prepare('DELETE FROM kb_docs WHERE collection_id IN (SELECT id FROM kb_collections WHERE id=? AND owner_id=?)').run(req.params.id, req.user.id);
    db.prepare('DELETE FROM kb_collections WHERE id=? AND owner_id=?').run(req.params.id, req.user.id);
    res.json({ ok: true });
  });
  app.get('/api/kb/:id/docs', authRequired, (req, res) => res.json({ docs: db.prepare('SELECT id,filename,substr(text,1,300) preview,created_at FROM kb_docs WHERE collection_id=?').all(req.params.id) }));
  app.post('/api/kb/:id/docs', authRequired, (req, res) => {
    const { filename, text } = req.body || {};
    if (!text?.trim()) return res.status(400).json({ error: 'نص المستند مطلوب' });
    const id = uid();
    db.prepare('INSERT INTO kb_docs(id,collection_id,filename,text) VALUES(?,?,?,?)').run(id, req.params.id, String(filename || 'doc.txt').slice(0, 120), String(text).slice(0, 100000));
    res.json({ ok: true, id });
  });
  app.delete('/api/kb-docs/:id', authRequired, (req, res) => { db.prepare('DELETE FROM kb_docs WHERE id=?').run(req.params.id); res.json({ ok: true }); });
  app.get('/api/kb/:id/search', authRequired, (req, res) => {
    res.json({ results: kbSearch(req.params.id, req.query.q || '').map(d => ({ filename: d.filename, score: d.score, preview: d.text.slice(0, 400) })) });
  });
  app.post('/api/kb/:id/ask', authRequired, limiter, async (req, res) => {
    const q = String(req.body?.question || '').slice(0, 1000);
    if (!q) return res.status(400).json({ error: 'اكتب سؤالك' });
    const hits = kbSearch(req.params.id, q);
    if (!hits.length) return res.json({ reply: 'لا توجد مقاطع مطابقة في هذه المجموعة — جرّب صياغة أخرى أو أضف مستندات.', sources: [] });
    const ctx = hits.map((h, i) => `[S${i + 1}:${h.filename}] ${h.text.slice(0, 1500)}`).join('\n\n');
    const r = await chatComplete({ messages: [{ role: 'system', content: 'أجب عن السؤال اعتمادًا على مقاطع المعرفة التالية فقط، مع ذكر [Sn:filename] بجانب كل معلومة. إن لم تكفِ المقاطع فصرّح بذلك.' }, { role: 'user', content: `السؤال: ${q}\nالمقاطع:\n${ctx}` }], lang: req.user.lang });
    bump(req.user.id, 'messages');
    res.json({ reply: r.text, mode: r.mode, sources: hits.map((h, i) => ({ n: i + 1, filename: h.filename })) });
  });

  /* ---------- images: history + variations ---------- */
  app.get('/api/images', authRequired, (req, res) => res.json({ images: db.prepare('SELECT * FROM image_history WHERE user_id=? ORDER BY created_at DESC LIMIT 50').all(req.user.id) }));
  // note: generation itself happens in chat (image intent) and is logged there
  app.post('/api/images/variation', authRequired, limiter, async (req, res) => {
    const src = db.prepare('SELECT * FROM image_history WHERE id=? AND user_id=?').get(req.body?.id, req.user.id);
    if (!src) return res.status(404).json({ error: 'غير موجود' });
    const seed = Math.floor(Math.random() * 1e9);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(src.prompt + ' variation')}?width=1024&height=1024&nologo=true&seed=${seed}`;
    const id = uid();
    db.prepare('INSERT INTO image_history(id,user_id,prompt,url,via) VALUES(?,?,?,?,?)').run(id, req.user.id, src.prompt, url, 'pollinations-free');
    res.json({ ok: true, id, url });
  });

  /* ---------- document studio ---------- */
  app.post('/api/docs', authRequired, limiter, async (req, res) => {
    const { title, topic, format } = req.body || {};
    if (!topic?.trim()) return res.status(400).json({ error: 'موضوع المستند مطلوب' });
    const fmt = (format || 'md').toLowerCase();
    if (['docx', 'pptx', 'xlsx'].includes(fmt)) return res.status(501).json({ error: 'تصدير DOCX/PPTX/XLSX يحتاج مكتبة Office خارجية — اختر MD/TXT/CSV/HTML وسنولّدها فورًا.' });
    if (!['md', 'txt', 'csv', 'html'].includes(fmt)) return res.status(400).json({ error: 'صيغة غير مدعومة (md/txt/csv/html)' });
    const r = await chatComplete({ messages: [{ role: 'system', content: `أنشئ مستندًا كاملًا بعنوان "${String(title || topic).slice(0, 100)}" بصيغة ${fmt.toUpperCase()} (عناوين، أقسام، نقاط، خاتمة). أخرج المحتوى فقط.` }, { role: 'user', content: String(topic).slice(0, 2000) }], lang: req.user.lang });
    bump(req.user.id, 'messages');
    res.json({ title: title || topic, format: fmt, content: r.text, mode: r.mode });
  });

  /* ---------- safe code sandbox (JS, isolated, time-limited) ---------- */
  app.post('/api/sandbox', authRequired, limiter, (req, res) => {
    const { language, code } = req.body || {};
    if (language !== 'javascript') return res.status(501).json({ error: `تنفيذ ${language || '?'} غير متاح في Sandbox — المدعوم حاليًا: JavaScript فقط (معزول، 3 ثوانٍ، بدون وصول للشبكة أو الأسرار).` });
    const src = String(code || '').slice(0, 10000);
    if (!src.trim()) return res.status(400).json({ error: 'لا كود للتنفيذ' });
    const logs = [];
    const t0 = Date.now();
    try {
      const sandbox = { console: { log: (...a) => logs.push(a.map(String).join(' ')) }, Math, JSON, String, Number, Array, Object };
      const out = vm.runInNewContext(src, sandbox, { timeout: 3000 });
      res.json({ ok: true, output: logs.join('\n') + (out !== undefined ? `\n=> ${String(out).slice(0, 2000)}` : ''), ms: Date.now() - t0 });
    } catch (e) {
      res.json({ ok: false, output: logs.join('\n'), error: String(e.message).slice(0, 500), ms: Date.now() - t0 });
    }
  });

  /* ---------- prompts v2: versions + optimizer ---------- */
  app.get('/api/prompts', authRequired, (req, res) => {
    const q = (req.query.q || '').trim(), cat = req.query.cat || '', fav = req.query.fav;
    let sql = "SELECT * FROM prompts WHERE (owner_id=? OR visibility='public')", args = [req.user.id];
    if (q) { sql += ' AND (title LIKE ? OR body LIKE ?)'; args.push(`%${q}%`, `%${q}%`); }
    if (cat) { sql += ' AND category=?'; args.push(cat); }
    if (fav) sql += ' AND fav=1';
    res.json({ prompts: db.prepare(sql + ' ORDER BY fav DESC, created_at DESC LIMIT 100').all(...args) });
  });
  app.post('/api/prompts', authRequired, (req, res) => {
    const { title, body, category, visibility } = req.body || {};
    if (!title?.trim()) return res.status(400).json({ error: 'العنوان مطلوب' });
    const id = uid();
    db.prepare('INSERT INTO prompts(id,owner_id,title,body,category,visibility) VALUES(?,?,?,?,?,?)').run(id, req.user.id, String(title).slice(0, 100), String(body || '').slice(0, 5000), String(category || 'عام').slice(0, 40), visibility === 'public' ? 'public' : 'private');
    db.prepare('INSERT INTO prompt_versions(prompt_id,v,body) VALUES(?,?,?)').run(id, 1, String(body || '').slice(0, 5000));
    res.json({ ok: true, id });
  });
  app.put('/api/prompts/:id', authRequired, (req, res) => {
    const p = db.prepare('SELECT * FROM prompts WHERE id=? AND owner_id=?').get(req.params.id, req.user.id);
    if (!p) return res.status(404).json({ error: 'غير موجود' });
    const { title, body, category, fav, visibility } = req.body || {};
    db.prepare('UPDATE prompts SET title=COALESCE(?,title),body=COALESCE(?,body),category=COALESCE(?,category),fav=COALESCE(?,fav),visibility=COALESCE(?,visibility) WHERE id=?').run(title ?? null, body ?? null, category ?? null, fav ?? null, visibility ?? null, p.id);
    if (body && body !== p.body) {
      const mx = db.prepare('SELECT MAX(v) m FROM prompt_versions WHERE prompt_id=?').get(p.id).m || 0;
      db.prepare('INSERT INTO prompt_versions(prompt_id,v,body) VALUES(?,?,?)').run(p.id, mx + 1, String(body).slice(0, 5000));
    }
    res.json({ ok: true });
  });
  app.delete('/api/prompts/:id', authRequired, (req, res) => {
    db.prepare('DELETE FROM prompt_versions WHERE prompt_id IN (SELECT id FROM prompts WHERE id=? AND owner_id=?)').run(req.params.id, req.user.id);
    db.prepare('DELETE FROM prompts WHERE id=? AND owner_id=?').run(req.params.id, req.user.id);
    res.json({ ok: true });
  });
  app.get('/api/prompts/:id/versions', authRequired, (req, res) => res.json({ versions: db.prepare('SELECT v,body,created_at FROM prompt_versions WHERE prompt_id=? ORDER BY v ASC').all(req.params.id) }));
  app.post('/api/prompts/:id/restore', authRequired, (req, res) => {
    const v = db.prepare('SELECT * FROM prompt_versions WHERE prompt_id=? AND v=?').get(req.params.id, Number(req.body?.v));
    if (!v) return res.status(404).json({ error: 'النسخة غير موجودة' });
    const mx = db.prepare('SELECT MAX(v) m FROM prompt_versions WHERE prompt_id=?').get(req.params.id).m || 0;
    db.prepare('UPDATE prompts SET body=? WHERE id=? AND owner_id=?').run(v.body, req.params.id, req.user.id);
    db.prepare('INSERT INTO prompt_versions(prompt_id,v,body) VALUES(?,?,?)').run(req.params.id, mx + 1, v.body);
    res.json({ ok: true });
  });
  app.post('/api/prompts/optimize', authRequired, limiter, async (req, res) => {
    const p = String(req.body?.prompt || '').slice(0, 2000);
    if (!p.trim()) return res.status(400).json({ error: 'اكتب البرومبت أولًا' });
    const r = await chatComplete({ messages: [{ role: 'system', content: 'أنت AI Prompt Optimizer. حوّل البرومبت التالي إلى نسخة أوضح ومنظمة (دور، سياق، مهمة، قيود، صيغة الإخراج). أخرج: النسخة المحسنة فقط.' }, { role: 'user', content: p }], lang: req.user.lang });
    bump(req.user.id, 'messages');
    res.json({ original: p, optimized: r.text, mode: r.mode });
  });

  /* ---------- model comparison (honest labels) ---------- */
  app.post('/api/compare', authRequired, limiter, async (req, res) => {
    const q = String(req.body?.content || '').slice(0, 2000);
    if (!q.trim()) return res.status(400).json({ error: 'اكتب السؤال' });
    const cap = require('./ai-provider');
    const out = [];
    const t1 = Date.now();
    const live = await chatComplete({ messages: [{ role: 'user', content: q }], lang: req.user.lang });
    out.push({ model: live.provider === 'mock' ? 'MODYX Smart (محلي)' : `${live.provider}/${live.model}`, response: live.text, latency_ms: Date.now() - t1, mode: live.mode });
    bump(req.user.id, 'messages');
    res.json({ results: out, note: live.mode === 'local-smart' ? 'لا يوجد مزود حي متصل — المقارنة تعمل بمحرك واحد حاليًا. اربط AI_API_KEY لمقارنة نموذجين حقيقيين.' : 'مقارنة بين المزود المتصل والوضع المحلي.' });
  });

  /* ---------- GitHub (user PAT, read-only usage) ---------- */
  const ghToken = (req) => db.prepare('SELECT github_token FROM users WHERE id=?').get(req.user.id)?.github_token || '';
  app.post('/api/github/connect', authRequired, (req, res) => {
    const t = String(req.body?.token || '').trim();
    if (!t) return res.status(400).json({ error: 'الصق الـ Token' });
    db.prepare('UPDATE users SET github_token=? WHERE id=?').run(t.slice(0, 200), req.user.id);
    res.json({ ok: true, note: 'يُستخدم التوكن للقراءة فقط عبر API — لا نطلب صلاحيات إضافية.' });
  });
  app.post('/api/github/disconnect', authRequired, (req, res) => { db.prepare("UPDATE users SET github_token='' WHERE id=?").run(req.user.id); res.json({ ok: true }); });
  app.get('/api/github/status', authRequired, async (req, res) => {
    const t = ghToken(req);
    if (!t) return res.json({ connected: false });
    try { const me = await gh(t, '/user'); res.json({ connected: true, login: me.login }); }
    catch { res.json({ connected: false, error: 'التوكن غير صالح' }); }
  });
  app.get('/api/github/repos', authRequired, needFlag('github'), async (req, res) => {
    const t = ghToken(req); if (!t) return res.status(400).json({ error: 'اربط توكن GitHub أولًا (PAT بصلاحية قراءة).' });
    try { res.json({ repos: await gh(t, '/user/repos?per_page=50&sort=updated') }); }
    catch (e) { res.status(502).json({ error: e.message }); }
  });
  app.get('/api/github/repo', authRequired, needFlag('github'), async (req, res) => {
    const t = ghToken(req); if (!t) return res.status(400).json({ error: 'اربط توكن GitHub أولًا.' });
    const { owner, repo, path } = req.query;
    if (!owner || !repo) return res.status(400).json({ error: 'owner و repo مطلوبان' });
    try {
      if (path) {
        const f = await gh(t, `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`);
        let text = '';
        if (f.content) text = Buffer.from(f.content, 'base64').toString('utf8').slice(0, 8000);
        return res.json({ file: { name: f.name, size: f.size, text } });
      }
      const [info, tree] = await Promise.all([gh(t, `/repos/${owner}/${repo}`), gh(t, `/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`)]);
      const r = await chatComplete({ messages: [{ role: 'system', content: 'حلل مستودع GitHub التالي باختصار: الغرض، التقنيات، أهم الملفات.' }, { role: 'user', content: `${info.full_name}: ${info.description || ''}\nملفات: ${(tree.tree || []).slice(0, 120).map(x => x.path).join(', ')}` }], lang: req.user.lang });
      res.json({ repo: { name: info.full_name, desc: info.description, lang: info.language, stars: info.stargazers_count }, analysis: r.text, files: (tree.tree || []).slice(0, 200).map(x => x.path) });
    } catch (e) { res.status(502).json({ error: e.message }); }
  });
  app.get('/api/github/issues', authRequired, needFlag('github'), async (req, res) => {
    const t = ghToken(req); if (!t) return res.status(400).json({ error: 'اربط توكن GitHub أولًا.' });
    try { res.json({ issues: await gh(t, `/repos/${req.query.owner}/${req.query.repo}/issues?per_page=30&state=all`) }); }
    catch (e) { res.status(502).json({ error: e.message }); }
  });
  app.get('/api/github/pulls', authRequired, needFlag('github'), async (req, res) => {
    const t = ghToken(req); if (!t) return res.status(400).json({ error: 'اربط توكن GitHub أولًا.' });
    try { res.json({ pulls: await gh(t, `/repos/${req.query.owner}/${req.query.repo}/pulls?per_page=30&state=all`) }); }
    catch (e) { res.status(502).json({ error: e.message }); }
  });

  /* ---------- API platform ---------- */
  app.get('/api/apikeys', authRequired, (req, res) => {
    res.json({ keys: db.prepare('SELECT id,name,prefix,scopes,daily_limit,monthly_limit,status,created_at FROM api_keys WHERE user_id=? ORDER BY created_at DESC').all(req.user.id) });
  });
  app.post('/api/apikeys', authRequired, (req, res) => {
    const { name, daily_limit, monthly_limit } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'اسم المفتاح مطلوب' });
    const secret = 'mky_' + crypto.randomBytes(24).toString('hex');
    const hash = crypto.createHash('sha256').update(secret).digest('hex');
    const id = uid();
    db.prepare('INSERT INTO api_keys(id,user_id,name,hash,prefix,daily_limit,monthly_limit) VALUES(?,?,?,?,?,?,?)')
      .run(id, req.user.id, String(name).slice(0, 60), hash, secret.slice(0, 10) + '...', Number(daily_limit) || 100, Number(monthly_limit) || 2000);
    res.json({ ok: true, id, secret, warning: 'انسخ الـSecret الآن — لن يُعرض مرة أخرى.' });
  });
  app.post('/api/apikeys/:id/revoke', authRequired, (req, res) => {
    db.prepare("UPDATE api_keys SET status='revoked' WHERE id=? AND user_id=?").run(req.params.id, req.user.id);
    res.json({ ok: true });
  });
  app.get('/api/apikeys/:id/usage', authRequired, (req, res) => {
    res.json({ usage: db.prepare('SELECT day,month,SUM(count) c FROM api_usage WHERE key_id=? GROUP BY day,month ORDER BY day DESC LIMIT 30').all(req.params.id) });
  });
  function apiKeyAuth(req, res, next) {
    const k = req.headers['x-api-key'] || '';
    if (!k) return res.status(401).json({ error: 'x-api-key مطلوب' });
    const hash = crypto.createHash('sha256').update(String(k)).digest('hex');
    const row = db.prepare("SELECT * FROM api_keys WHERE hash=? AND status='active'").get(hash);
    if (!row) return res.status(401).json({ error: 'مفتاح غير صالح' });
    const day = new Date().toISOString().slice(0, 10), month = day.slice(0, 7);
    const d = db.prepare('SELECT SUM(count) c FROM api_usage WHERE key_id=? AND day=?').get(row.id, day).c || 0;
    const m = db.prepare('SELECT SUM(count) c FROM api_usage WHERE key_id=? AND month=?').get(row.id, month).c || 0;
    if (d >= row.daily_limit) return res.status(429).json({ error: 'تجاوزت الحد اليومي للمفتاح' });
    if (m >= row.monthly_limit) return res.status(429).json({ error: 'تجاوزت الحد الشهري للمفتاح' });
    db.prepare('INSERT INTO api_usage(key_id,day,month) VALUES(?,?,?)').run(row.id, day, month);
    db.prepare('INSERT INTO api_logs(key_id,endpoint,status) VALUES(?,?,?)').run(row.id, req.path, 200);
    req.apikey = row;
    next();
  }
  app.get('/api/v1/models', apiKeyAuth, (req, res) => res.json({ models: [{ id: 'modyx-chat', capabilities: ['chat'] }] }));
  app.post('/api/v1/chat', apiKeyAuth, rateLimit({ windowMs: 60 * 1000, max: 100 }), async (req, res) => {
    const msg = String(req.body?.message || '').slice(0, 4000);
    if (!msg.trim()) return res.status(400).json({ error: 'message مطلوب' });
    const r = await chatComplete({ messages: [{ role: 'user', content: msg }], lang: 'ar' });
    res.json({ reply: r.text, mode: r.mode });
  });

  /* ---------- webhooks ---------- */
  app.get('/api/webhooks', authRequired, (req, res) => res.json({ webhooks: db.prepare('SELECT id,url,events,enabled,created_at FROM webhooks WHERE user_id=?').all(req.user.id) }));
  app.post('/api/webhooks', authRequired, needFlag('webhooks'), (req, res) => {
    const { url, secret, events } = req.body || {};
    try { new URL(url); } catch { return res.status(400).json({ error: 'رابط غير صالح' }); }
    const id = uid();
    db.prepare('INSERT INTO webhooks(id,user_id,url,secret,events) VALUES(?,?,?,?,?)').run(id, req.user.id, url, String(secret || '').slice(0, 200), JSON.stringify(events || ['*']).slice(0, 500));
    res.json({ ok: true, id });
  });
  app.put('/api/webhooks/:id', authRequired, (req, res) => {
    db.prepare('UPDATE webhooks SET url=COALESCE(?,url),secret=COALESCE(?,secret),events=COALESCE(?,events),enabled=COALESCE(?,enabled) WHERE id=? AND user_id=?')
      .run(req.body?.url ?? null, req.body?.secret ?? null, req.body?.events ? JSON.stringify(req.body.events).slice(0, 500) : null, req.body?.enabled ?? null, req.params.id, req.user.id);
    res.json({ ok: true });
  });
  app.delete('/api/webhooks/:id', authRequired, (req, res) => { db.prepare('DELETE FROM webhooks WHERE id=? AND user_id=?').run(req.params.id, req.user.id); res.json({ ok: true }); });
  app.post('/api/webhooks/:id/test', authRequired, async (req, res) => {
    const w = db.prepare('SELECT * FROM webhooks WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!w) return res.status(404).json({ error: 'غير موجود' });
    res.json({ ok: await deliverWh(w, 'test', { hello: 'modyx' }) });
  });
  app.get('/api/webhooks/:id/deliveries', authRequired, (req, res) => res.json({ deliveries: db.prepare('SELECT * FROM webhook_deliveries WHERE webhook_id=? ORDER BY id DESC LIMIT 50').all(req.params.id) }));

  /* ---------- marketplace + reviews ---------- */
  app.get('/api/market', (req, res) => {
    const items = db.prepare("SELECT m.*,u.name owner FROM marketplace_items m JOIN users u ON u.id=m.owner_id WHERE visibility='public' ORDER BY created_at DESC LIMIT 50").all();
    const out = items.map(i => ({ ...i, rating: db.prepare('SELECT AVG(rating) a,COUNT(*) c FROM reviews WHERE item_id=?').get(i.id) }));
    res.json({ items: out });
  });
  app.post('/api/market', authRequired, needFlag('marketplace'), (req, res) => {
    const { kind, ref_id, title, body, visibility } = req.body || {};
    if (!['custom_ai', 'prompt', 'tool', 'workflow'].includes(kind)) return res.status(400).json({ error: 'نوع غير صالح' });
    if (!title?.trim()) return res.status(400).json({ error: 'العنوان مطلوب' });
    const id = uid();
    db.prepare('INSERT INTO marketplace_items(id,owner_id,kind,ref_id,title,body,visibility) VALUES(?,?,?,?,?,?,?)')
      .run(id, req.user.id, kind, ref_id || '', String(title).slice(0, 100), String(body || '').slice(0, 5000), ['public', 'unlisted'].includes(visibility) ? visibility : 'public');
    res.json({ ok: true, id });
  });
  app.delete('/api/market/:id', authRequired, (req, res) => {
    const it = db.prepare('SELECT * FROM marketplace_items WHERE id=?').get(req.params.id);
    if (!it || (it.owner_id !== req.user.id && req.user.role !== 'admin')) return res.status(403).json({ error: 'غير مصرح' });
    db.prepare('DELETE FROM marketplace_items WHERE id=?').run(it.id);
    res.json({ ok: true });
  });
  app.post('/api/market/:id/review', authRequired, limiter, (req, res) => {
    const rating = Number(req.body?.rating);
    if (![1, 2, 3, 4, 5].includes(rating)) return res.status(400).json({ error: 'قيّم من 1 إلى 5' });
    try {
      db.prepare('INSERT INTO reviews(id,item_id,user_id,rating,comment) VALUES(?,?,?,?,?)').run(uid(), req.params.id, req.user.id, rating, String(req.body?.comment || '').slice(0, 500));
    } catch { return res.status(400).json({ error: 'قيّمت هذا العنصر مسبقًا (تقييم واحد لكل مستخدم لمنع السبام).' }); }
    res.json({ ok: true });
  });
  app.get('/api/market/:id/reviews', (req, res) => res.json({ reviews: db.prepare('SELECT r.*,u.name FROM reviews r JOIN users u ON u.id=r.user_id WHERE item_id=? ORDER BY created_at DESC LIMIT 50').all(req.params.id) }));
  app.post('/api/market/:id/report', authRequired, (req, res) => {
    db.prepare('INSERT INTO reports(id,item_id,user_id,reason) VALUES(?,?,?,?)').run(uid(), req.params.id, req.user.id, String(req.body?.reason || '').slice(0, 300));
    res.json({ ok: true });
  });

  /* ---------- teams ---------- */
  app.get('/api/teams', authRequired, needFlag('teams'), (req, res) => {
    res.json({ teams: db.prepare('SELECT t.*,tm.role FROM teams t JOIN team_members tm ON tm.team_id=t.id WHERE tm.user_id=?').all(req.user.id) });
  });
  app.post('/api/teams', authRequired, needFlag('teams'), (req, res) => {
    if (!req.body?.name?.trim()) return res.status(400).json({ error: 'اسم الفريق مطلوب' });
    const id = uid();
    db.prepare('INSERT INTO teams(id,owner_id,name) VALUES(?,?,?)').run(id, req.user.id, String(req.body.name).slice(0, 80));
    db.prepare("INSERT INTO team_members(team_id,user_id,role) VALUES(?,?,'owner')").run(id, req.user.id);
    res.json({ ok: true, id });
  });
  app.post('/api/teams/:id/members', authRequired, (req, res) => {
    const me = db.prepare("SELECT role FROM team_members WHERE team_id=? AND user_id=?").get(req.params.id, req.user.id);
    if (!me || !['owner', 'admin'].includes(me.role)) return res.status(403).json({ error: 'تحتاج دور Owner/Admin' });
    const u = db.prepare('SELECT id FROM users WHERE email=?').get(String(req.body?.email || '').toLowerCase().trim());
    if (!u) return res.status(404).json({ error: 'المستخدم غير موجود' });
    const role = ['admin', 'member', 'viewer'].includes(req.body?.role) ? req.body.role : 'member';
    db.prepare('INSERT INTO team_members(team_id,user_id,role) VALUES(?,?,?) ON CONFLICT(team_id,user_id) DO UPDATE SET role=excluded.role').run(req.params.id, u.id, role);
    res.json({ ok: true });
  });
  app.delete('/api/teams/:id/members/:uid', authRequired, (req, res) => {
    const me = db.prepare('SELECT role FROM team_members WHERE team_id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!me || (!['owner', 'admin'].includes(me.role) && req.params.uid !== req.user.id)) return res.status(403).json({ error: 'غير مصرح' });
    db.prepare('DELETE FROM team_members WHERE team_id=? AND user_id=?').run(req.params.id, req.params.uid);
    res.json({ ok: true });
  });
  app.get('/api/teams/:id/chats', authRequired, (req, res) => {
    if (!db.prepare('SELECT 1 FROM team_members WHERE team_id=? AND user_id=?').get(req.params.id, req.user.id)) return res.status(403).json({ error: 'لست عضوًا' });
    res.json({ chats: db.prepare('SELECT * FROM conversations WHERE team_id=? ORDER BY updated_at DESC LIMIT 50').all(req.params.id) });
  });

  /* ---------- credits + referrals ---------- */
  app.get('/api/credits/me', authRequired, (req, res) => {
    const bal = db.prepare('SELECT credits FROM users WHERE id=?').get(req.user.id)?.credits ?? 0;
    res.json({ balance: bal, history: db.prepare('SELECT * FROM credit_ledger WHERE user_id=? ORDER BY id DESC LIMIT 50').all(req.user.id) });
  });
  app.get('/api/referral/me', authRequired, (req, res) => {
    let r = db.prepare('SELECT * FROM referrals WHERE user_id=?').get(req.user.id);
    if (!r) {
      const code = 'MDX-' + crypto.randomBytes(4).toString('hex').toUpperCase();
      db.prepare('INSERT INTO referrals(id,user_id,code) VALUES(?,?,?)').run(uid(), req.user.id, code);
      r = db.prepare('SELECT * FROM referrals WHERE user_id=?').get(req.user.id);
    }
    db.prepare('UPDATE users SET referral_code=? WHERE id=? AND (referral_code IS NULL OR referral_code=\'\')').run(r.code, req.user.id);
    res.json({ code: r.code, invites: r.invites, successful: r.successful, reward: Number(getSetting('credit_referral_reward', '200')) });
  });

  /* ---------- push (honest status) ---------- */
  app.post('/api/push', authRequired, (req, res) => {
    db.prepare('INSERT INTO push_subs(user_id,sub,enabled) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET sub=excluded.sub,enabled=excluded.enabled')
      .run(req.user.id, JSON.stringify(req.body?.sub || {}).slice(0, 3000), req.body?.enabled ? 1 : 0);
    res.json({ ok: true });
  });
  app.get('/api/push/status', authRequired, (req, res) => {
    const has = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
    res.json({ supported: has, saved: !!db.prepare('SELECT * FROM push_subs WHERE user_id=?').get(req.user.id), reason: has ? '' : 'إرسال Push يحتاج مفاتيح VAPID — الإشعارات داخل التطبيق تعمل بديلًا.' });
  });

  /* ---------- universal search ---------- */
  app.get('/api/universal', authRequired, (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (!q) return res.status(400).json({ error: 'اكتب كلمة البحث' });
    const like = `%${q}%`;
    res.json({
      chats: db.prepare('SELECT id,title FROM conversations WHERE user_id=? AND title LIKE ? LIMIT 5').all(req.user.id, like),
      messages: db.prepare('SELECT m.id,m.content FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.user_id=? AND m.content LIKE ? LIMIT 5').all(req.user.id, like),
      files: db.prepare('SELECT id,original_name FROM files WHERE user_id=? AND original_name LIKE ? LIMIT 5').all(req.user.id, like),
      prompts: db.prepare("SELECT id,title FROM prompts WHERE (owner_id=? OR visibility='public') AND title LIKE ? LIMIT 5").all(req.user.id, like),
      assistants: db.prepare("SELECT id,name FROM custom_ai WHERE (owner_id=? OR visibility='public') AND name LIKE ? LIMIT 5").all(req.user.id, like),
      market: db.prepare("SELECT id,title FROM marketplace_items WHERE visibility='public' AND title LIKE ? LIMIT 5").all(like),
    });
  });

  /* ---------- morning briefing on demand ---------- */
  app.post('/api/briefing', authRequired, limiter, async (req, res) => {
    try {
      const text = await buildBriefing(String(req.body?.city || 'القاهرة').slice(0, 60), req.user);
      bump(req.user.id, 'messages');
      res.json({ briefing: text });
    } catch (e) { res.status(502).json({ error: 'تعذر بناء البريف: ' + e.message }); }
  });

  /* ---------- compare two documents ---------- */
  app.post('/api/compare-docs', authRequired, limiter, async (req, res) => {
    const a = String(req.body?.textA || '').slice(0, 6000), b = String(req.body?.textB || '').slice(0, 6000);
    if (!a.trim() || !b.trim()) return res.status(400).json({ error: 'الصق النصين للمقارنة' });
    const r = await chatComplete({ messages: [{ role: 'system', content: 'قارن بين النصين التاليين بمنهجية: أوجه التشابه، أوجه الاختلاف (جدول)، وأيهما أفضل ولماذا. بالعربية.' }, { role: 'user', content: `النص الأول:\n${a}\n\nالنص الثاني:\n${b}` }], lang: req.user.lang });
    bump(req.user.id, 'messages');
    res.json({ comparison: r.text, mode: r.mode });
  });

  /* ---------- translate image text (vision provider, else honest) ---------- */
  app.post('/api/vision/translate', authRequired, limiter, (req, res) => {
    const multer = require('multer');
    const up = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } }).single('image');
    up(req, res, async (err) => {
      if (err || !req.file) return res.status(400).json({ error: 'ارفع صورة أولًا' });
      const target = String(req.body?.target || 'العربية').slice(0, 30);
      const cap = capabilities();
      if (!cap.vision) return res.json({ translation: null, note: 'قراءة النصوص من الصور تحتاج نموذج Vision متصل — ' + cap.visionNote });
      try {
        const b64 = req.file.buffer.toString('base64');
        const base = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
        const r = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AI_API_KEY}` },
          body: JSON.stringify({ model: cap.model, max_tokens: 1000, messages: [{ role: 'user', content: [{ type: 'text', text: `اقرأ كل النصوص الظاهرة في الصورة ثم ترجمها إلى ${target}. أخرج: النص الأصلي ثم الترجمة.` }, { type: 'image_url', image_url: { url: `data:${req.file.mimetype};base64,${b64}` } }] }] }),
        });
        const j = await r.json();
        const t = j.choices?.[0]?.message?.content || '';
        if (!t) throw new Error('empty');
        bump(req.user.id, 'images');
        res.json({ translation: t, via: cap.provider });
      } catch { res.json({ translation: null, note: 'تعذر الاتصال بنموذج الرؤية — حاول لاحقًا.' }); }
    });
  });

  /* ---------- payments: manual (vodafone/instapay + proof) + Stripe-ready ---------- */
  app.get('/api/payments/methods', authRequired, (req, res) => res.json({
    methods: [
      { id: 'vodafone', name: 'فودافون كاش', hint: getSetting('pay_vodafone_number', '') || 'يُعلن من الإدارة', manual: true },
      { id: 'instapay', name: 'انستاباي', hint: getSetting('pay_instapay_handle', '') || 'يُعلن من الإدارة', manual: true },
      { id: 'stripe', name: 'بطاقة بنكية (Stripe)', manual: false, ready: Boolean(process.env.STRIPE_SECRET_KEY) },
    ],
  }));
  app.post('/api/payments', authRequired, (req, res) => {
    const { plan, method, tx } = req.body || {};
    if (!['pro', 'developer', 'team', 'vip'].includes(plan)) return res.status(400).json({ error: 'خطة غير معروفة' });
    if (!['vodafone', 'instapay', 'stripe'].includes(method)) return res.status(400).json({ error: 'وسيلة غير معروفة' });
    if (method === 'stripe' && process.env.STRIPE_SECRET_KEY) {
      // real Stripe Checkout hook (requires STRIPE_SECRET_KEY + price configured)
      return res.json({ stripe: true, note: 'ادفع عبر Stripe ثم سيُفعّل اشتراكك تلقائيًا (Webhook). أكمل الإعداد من الإدارة.' });
    }
    if (!String(tx || '').trim()) return res.status(400).json({ error: 'أدخل رقم العملية/التحويل كإثبات دفع' });
    const id = uid();
    db.prepare('INSERT INTO payments(id,user_id,plan,method,tx) VALUES(?,?,?,?,?)').run(id, req.user.id, plan, method, String(tx).slice(0, 100));
    res.json({ ok: true, id, note: 'تم استلام إثبات الدفع — التفعيل بعد مراجعة الإدارة (عادة خلال ساعات).' });
  });
  app.get('/api/admin/payments', authRequired, adminRequired, (req, res) => res.json({ payments: db.prepare('SELECT p.*,u.email FROM payments p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 100').all() }));
  app.post('/api/admin/payments/:id/approve', authRequired, adminRequired, (req, res) => {
    const p = db.prepare("SELECT * FROM payments WHERE id=? AND status='pending'").get(req.params.id);
    if (!p) return res.status(404).json({ error: 'غير موجود أو تم البت فيه' });
    const exp = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    db.prepare('UPDATE users SET plan=?,plan_expires=? WHERE id=?').run(p.plan, exp, p.user_id);
    db.prepare("UPDATE payments SET status='approved',decided_at=datetime('now') WHERE id=?").run(p.id);
    db.prepare('INSERT INTO notifications(id,user_id,title,body,kind) VALUES(?,?,?,?,?)').run(uid(), p.user_id, 'تم تفعيل اشتراكك 💎', `خطتك الآن ${p.plan} حتى ${exp}.`, 'sub');
    try { emitEvent('subscription.approved', p.user_id, { plan: p.plan, via: 'payment' }); } catch {}
    adminLog(req.user.id, 'payment_approve', `${p.user_id} -> ${p.plan}`);
    res.json({ ok: true });
  });
  app.post('/api/admin/payments/:id/reject', authRequired, adminRequired, (req, res) => {
    db.prepare("UPDATE payments SET status='rejected',decided_at=datetime('now') WHERE id=?").run(req.params.id);
    adminLog(req.user.id, 'payment_reject', req.params.id);
    res.json({ ok: true });
  });

  /* ---------- ads (free-plan only, tracked; guests treated as free) ---------- */
  app.get('/api/ads', (req, res) => {
    const fromCookie = req.headers.cookie?.match(/modyx_token=([^;]+)/)?.[1];
    const hdr = req.headers.authorization?.replace('Bearer ', '');
    const tok = hdr || (fromCookie ? decodeURIComponent(fromCookie) : null);
    let plan = 'free';
    if (tok) {
      try {
        const jwt = require('jsonwebtoken');
        const p = jwt.verify(tok, process.env.AUTH_SECRET || 'dev-secret-change-me-please-32chars!!');
        plan = db.prepare('SELECT plan FROM users WHERE id=?').get(p.id)?.plan || 'free';
      } catch {}
    }
    if (getSetting('ads_enabled', '1') !== '1') return res.json({ ads: [] });
    if (plan !== 'free') return res.json({ ads: [] });
    const placement = String(req.query.placement || 'chat');
    const ads = db.prepare('SELECT id,title,body,image_url,link FROM ads WHERE enabled=1 AND placement=? ORDER BY RANDOM() LIMIT 1').all(placement);
    if (ads[0]) db.prepare('UPDATE ads SET impressions=impressions+1 WHERE id=?').run(ads[0].id);
    res.json({ ads });
  });
  app.post('/api/ads/:id/click', (req, res) => {
    db.prepare('UPDATE ads SET clicks=clicks+1 WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });
  app.get('/api/admin/ads', authRequired, adminRequired, (req, res) => res.json({ ads: db.prepare('SELECT * FROM ads ORDER BY created_at DESC').all() }));
  app.post('/api/admin/ads', authRequired, adminRequired, (req, res) => {
    const { title, body, image_url, link, placement } = req.body || {};
    if (!title?.trim()) return res.status(400).json({ error: 'العنوان مطلوب' });
    const id = uid();
    db.prepare('INSERT INTO ads(id,title,body,image_url,link,placement) VALUES(?,?,?,?,?,?)').run(id, String(title).slice(0, 100), String(body || '').slice(0, 300), String(image_url || '').slice(0, 500), String(link || '').slice(0, 500), placement === 'landing' ? 'landing' : 'chat');
    adminLog(req.user.id, 'ad_create', title);
    res.json({ ok: true, id });
  });
  app.put('/api/admin/ads/:id', authRequired, adminRequired, (req, res) => {
    db.prepare('UPDATE ads SET title=COALESCE(?,title),body=COALESCE(?,body),image_url=COALESCE(?,image_url),link=COALESCE(?,link),enabled=COALESCE(?,enabled) WHERE id=?')
      .run(req.body?.title ?? null, req.body?.body ?? null, req.body?.image_url ?? null, req.body?.link ?? null, req.body?.enabled ?? null, req.params.id);
    res.json({ ok: true });
  });
  app.delete('/api/admin/ads/:id', authRequired, adminRequired, (req, res) => { db.prepare('DELETE FROM ads WHERE id=?').run(req.params.id); res.json({ ok: true }); });

  /* ---------- telegram bot (private + groups, linked accounts) ---------- */
  const TG = () => process.env.TELEGRAM_BOT_TOKEN || '';
  async function tgSend(chatId, text, extra = {}) {
    if (!TG()) return false;
    try {
      const r = await fetch(`https://api.telegram.org/bot${TG()}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 4000), ...extra }),
        signal: AbortSignal.timeout(10000),
      });
      return r.ok;
    } catch { return false; }
  }
  app.get('/api/telegram/status', authRequired, async (req, res) => {
    const linked = db.prepare('SELECT chat_id FROM telegram_users WHERE user_id=?').get(req.user.id);
    let bot = null, webhook = null;
    if (TG()) {
      try { bot = await fetch(`https://api.telegram.org/bot${TG()}/getMe`, { signal: AbortSignal.timeout(8000) }).then(r => r.json()).then(j => j.result); } catch {}
      try { webhook = await fetch(`https://api.telegram.org/bot${TG()}/getWebhookInfo`, { signal: AbortSignal.timeout(8000) }).then(r => r.json()).then(j => j.result); } catch {}
    }
    res.json({ configured: Boolean(TG()), bot: bot ? { username: bot.username, name: bot.first_name } : null, webhook_url: webhook?.url || '', linked: linked ? { chat_id: linked.chat_id } : null, reason: TG() ? '' : 'ضع TELEGRAM_BOT_TOKEN في .env ثم اضبط الـ Webhook من الإدارة.' });
  });
  app.post('/api/telegram/code', authRequired, (req, res) => {
    if (!TG()) return res.status(400).json({ error: 'بوت Telegram غير مربوط على الخادم (TELEGRAM_BOT_TOKEN).' });
    const code = String(Math.floor(100000 + Math.random() * 900000));
    db.prepare('INSERT INTO telegram_links(code,user_id) VALUES(?,?) ON CONFLICT(code) DO UPDATE SET user_id=excluded.user_id').run(code, req.user.id);
    res.json({ code, note: 'أرسل /link CODE للبوت خلال 15 دقيقة.' });
  });
  app.post('/api/telegram/disconnect', authRequired, (req, res) => { db.prepare('DELETE FROM telegram_users WHERE user_id=?').run(req.user.id); res.json({ ok: true }); });
  app.post('/api/telegram/hook', async (req, res) => {
    try {
      const key = req.query.key || '';
      if (!process.env.TELEGRAM_WEBHOOK_SECRET || key !== process.env.TELEGRAM_WEBHOOK_SECRET) return res.status(403).json({ error: 'forbidden' });
      const msg = req.body?.message;
      if (!msg?.text) return res.json({ ok: true });
      const chatId = String(msg.chat.id), text = String(msg.text).slice(0, 2000);
      const chatType = msg.chat.type || 'private';
      const botName = process.env.TELEGRAM_BOT_NAME || '';
      // link flow
      const linkM = text.match(/^\/link\s+(\d{6})/);
      if (linkM) {
        const row = db.prepare("SELECT * FROM telegram_links WHERE code=? AND expires>datetime('now')").get(linkM[1]);
        if (!row) { await tgSend(chatId, 'الكود غير صالح أو منتهي — أنشئ كودًا جديدًا من التطبيق.'); return res.json({ ok: true }); }
        db.prepare('INSERT INTO telegram_users(user_id,chat_id,username) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET chat_id=excluded.chat_id,username=excluded.username').run(row.user_id, chatId, msg.from?.username || '');
        db.prepare('DELETE FROM telegram_links WHERE code=?').run(linkM[1]);
        await tgSend(chatId, 'تم ربط حسابك ✅ — أرسل أي سؤال وسأجيبك هنا. في المجموعات اذكرني بـ @' + (botName || 'البوت') + '.');
        return res.json({ ok: true });
      }
      if (/^\/start/.test(text)) {
        await tgSend(chatId, chatType === 'private' ? 'أهلًا بك في MODYX AI 🤖 — اربط حسابك أولًا: من التطبيق (الإعدادات ← ربط Telegram) خذ الكود وأرسل /link 123456 هنا.' : 'أهلًا بالمجموعة 👋 — اذكروني (@' + (botName || 'البوت') + ') مع سؤالكم وسأجيب.');
        return res.json({ ok: true });
      }
      // groups: answer only on mention or /ask
      if (chatType === 'group' || chatType === 'supergroup') {
        const mentioned = (botName && text.toLowerCase().includes(('@' + botName).toLowerCase())) || /^\/ask[\s@]/i.test(text);
        if (!mentioned) return res.json({ ok: true, ignored: true });
      }
      // find owner: private must be linked; group: any linked member? use sender if linked
      let owner = db.prepare('SELECT user_id FROM telegram_users WHERE chat_id=?').get(chatId);
      if (!owner && (chatType === 'group' || chatType === 'supergroup')) {
        const sender = msg.from?.id ? db.prepare('SELECT user_id FROM telegram_users WHERE chat_id=?').get(String(msg.from.id)) : null;
        owner = sender;
      }
      if (!owner) { if (chatType === 'private') await tgSend(chatId, 'اربط حسابك أولًا بأمر /link CODE (من التطبيق).'); return res.json({ ok: true }); }
      const u = db.prepare("SELECT id,lang FROM users WHERE id=?").get(owner.user_id);
      if (!u) return res.json({ ok: true });
      const { processMessage } = require('./server');
      let conv = db.prepare("SELECT * FROM conversations WHERE user_id=? AND title='Telegram'").get(u.id);
      if (!conv) {
        const nid = crypto.randomUUID();
        db.prepare('INSERT INTO conversations(id,user_id,title) VALUES(?,?,?)').run(nid, u.id, 'Telegram');
        conv = db.prepare('SELECT * FROM conversations WHERE id=?').get(nid);
      }
      const clean = text.replace(/^\/ask(@\w+)?\s*/i, '').replace(botName ? new RegExp('@' + botName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : '@@@', '').trim() || text;
      const out = await processMessage(conv, { id: u.id, lang: u.lang || 'ar' }, { content: clean });
      if (out.widget?.type === 'image' && out.widget.url?.startsWith('http')) {
        try { await fetch(`https://api.telegram.org/bot${TG()}/sendPhoto`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, photo: out.widget.url, caption: out.reply.slice(0, 1000) }), signal: AbortSignal.timeout(15000) }); return res.json({ ok: true }); } catch {}
      }
      await tgSend(chatId, out.reply);
      res.json({ ok: true });
    } catch (e) { res.json({ ok: true, swallowed: String(e.message).slice(0, 100) }); }
  });
  app.post('/api/admin/telegram/webhook', authRequired, adminRequired, async (req, res) => {
    if (!TG()) return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN غير مضبوط' });
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: 'رابط الـ Webhook مطلوب (https عام)' });
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
    try {
      const r = await fetch(`https://api.telegram.org/bot${TG()}/setWebhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, secret_token: undefined, ...(secret ? {} : {}) }), signal: AbortSignal.timeout(10000) }).then(r => r.json());
      adminLog(req.user.id, 'tg_webhook', url);
      res.json({ ok: r.ok, desc: r.description || '' });
    } catch (e) { res.status(502).json({ error: e.message }); }
  });
  /* ---------- my usage stats ---------- */
  app.get('/api/stats/me', authRequired, (req, res) => {
    const days = db.prepare("SELECT day,messages,files,searches FROM usage WHERE user_id=? ORDER BY day DESC LIMIT 14").all(req.user.id).reverse();
    const modes = db.prepare("SELECT m.meta FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.user_id=? AND m.role='assistant' ORDER BY m.created_at DESC LIMIT 200").all(req.user.id);
    const byMode = {};
    for (const r of modes) { try { const m = JSON.parse(r.meta || '{}').mode || 'chat'; byMode[m] = (byMode[m] || 0) + 1; } catch {} }
    const hours = new Array(24).fill(0);
    for (const r of db.prepare("SELECT m.created_at t FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.user_id=? AND m.role='user' ORDER BY m.created_at DESC LIMIT 300").all(req.user.id)) {
      const h = new Date(String(r.t).replace(' ', 'T') + 'Z').getUTCHours();
      if (!isNaN(h)) hours[h]++;
    }
    res.json({ days, byMode, hours, total: days.reduce((s, d) => s + (d.messages || 0), 0) });
  });

  /* ---------- serverless cron trigger (Vercel/others hit this URL on schedule) ---------- */
  app.get('/api/cron', async (req, res) => {
    const ua = req.headers['user-agent'] || '';
    const okKey = process.env.CRON_SECRET && req.query.key === process.env.CRON_SECRET;
    const okCron = ua.includes('vercel-cron');
    if (!okKey && !okCron) return res.status(403).json({ error: 'forbidden' });
    const ran = await runDueTasks();
    res.json({ ok: true, ran });
  });

  /* ---------- admin ops ---------- */
  app.get('/api/admin/revenue', authRequired, adminRequired, (req, res) => {
    const subs = db.prepare('SELECT status,COUNT(*) c FROM subscriptions GROUP BY status').all();
    const issued = db.prepare("SELECT SUM(amount) s FROM credit_ledger WHERE amount>0").get().s || 0;
    const spent = db.prepare("SELECT SUM(amount) s FROM credit_ledger WHERE amount<0").get().s || 0;
    const active = db.prepare("SELECT COUNT(*) c FROM usage WHERE day=?").get(new Date().toISOString().slice(0, 10)).c;
    res.json({ subs, credits_issued: issued, credits_spent: Math.abs(spent), active_today: active, prices: { pro: getSetting('plan_pro_price', '49'), dev: getSetting('plan_dev_price', '149'), team: getSetting('plan_team_price', '299') } });
  });
  app.post('/api/admin/credits', authRequired, adminRequired, (req, res) => {
    const { email, amount, reason } = req.body || {};
    const u = db.prepare('SELECT id FROM users WHERE email=?').get(String(email || '').toLowerCase().trim());
    if (!u) return res.status(404).json({ error: 'المستخدم غير موجود' });
    db.prepare('UPDATE users SET credits=credits+? WHERE id=?').run(Number(amount) || 0, u.id);
    db.prepare('INSERT INTO credit_ledger(user_id,amount,reason) VALUES(?,?,?)').run(u.id, Number(amount) || 0, `admin: ${reason || ''}`.slice(0, 200));
    adminLog(req.user.id, 'credits_adjust', `${email} ${amount}`);
    res.json({ ok: true });
  });
  app.get('/api/admin/chats', authRequired, adminRequired, (req, res) => res.json({ chats: db.prepare('SELECT c.*,u.email FROM conversations c JOIN users u ON u.id=c.user_id ORDER BY c.updated_at DESC LIMIT 100').all() }));
  app.get('/api/admin/files', authRequired, adminRequired, (req, res) => res.json({ files: db.prepare('SELECT f.*,u.email FROM files f JOIN users u ON u.id=f.user_id ORDER BY f.created_at DESC LIMIT 100').all() }));
  app.get('/api/admin/feedback', authRequired, adminRequired, (req, res) => res.json({ feedback: db.prepare('SELECT * FROM feedback ORDER BY created_at DESC LIMIT 100').all() }));
  app.get('/api/admin/apikeys', authRequired, adminRequired, (req, res) => res.json({ keys: db.prepare('SELECT k.*,u.email FROM api_keys k JOIN users u ON u.id=k.user_id ORDER BY k.created_at DESC LIMIT 100').all() }));
  app.get('/api/admin/status', authRequired, adminRequired, async (req, res) => {
    const st = {};
    try { db.prepare('SELECT 1').get(); st.database = 'operational'; } catch { st.database = 'down'; }
    try { fs.writeFileSync(path.join(__dirname, '..', 'data', '.wtest'), 'ok'); fs.unlinkSync(path.join(__dirname, '..', 'data', '.wtest')); st.storage = 'operational'; } catch { st.storage = 'down'; }
    const cap = capabilities();
    st.ai = cap.configured ? 'operational' : 'degraded';
    st.search = (process.env.TAVILY_API_KEY || process.env.SERPER_API_KEY) ? 'operational' : 'degraded';
    st.auth = (process.env.AUTH_SECRET || '').length >= 16 ? 'operational' : 'down';
    st.api = 'operational';
    try { st.webhooks = db.prepare('SELECT COUNT(*) c FROM webhooks WHERE enabled=1').get().c >= 0 ? 'operational' : 'down'; } catch { st.webhooks = 'down'; }
    res.json({ status: st, provider: cap.provider, mode: cap.mode });
  });
  app.get('/api/admin/flags', authRequired, adminRequired, (req, res) => res.json({ flags: db.prepare('SELECT * FROM feature_flags').all() }));
  app.put('/api/admin/flags', authRequired, adminRequired, (req, res) => {
    for (const [k, v] of Object.entries(req.body || {})) {
      if (/^[a-z_]+$/.test(k)) db.prepare('INSERT INTO feature_flags(key,enabled) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET enabled=excluded.enabled').run(k, v ? 1 : 0);
    }
    adminLog(req.user.id, 'flags_update', JSON.stringify(Object.keys(req.body || {})));
    res.json({ ok: true });
  });
  /* backups: create/list/download/restore (admin only) */
  const bkDir = path.join(__dirname, '..', 'data', 'backups');
  fs.mkdirSync(bkDir, { recursive: true });
  app.post('/api/admin/backups', authRequired, adminRequired, (req, res) => {
    try {
      const id = uid(), fn = `bk-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
      const { db: mainDb } = require('./db');
      mainDb.exec(`VACUUM INTO '${path.join(bkDir, fn).replace(/'/g, "''")}'`);
      const size = fs.statSync(path.join(bkDir, fn)).size;
      db.prepare('INSERT INTO backups(id,filename,size) VALUES(?,?,?)').run(id, fn, size);
      adminLog(req.user.id, 'backup_create', fn);
      res.json({ ok: true, id, filename: fn, size });
    } catch (e) { res.status(500).json({ error: 'فشل النسخ: ' + e.message }); }
  });
  app.get('/api/admin/backups', authRequired, adminRequired, (req, res) => res.json({ backups: db.prepare('SELECT * FROM backups ORDER BY created_at DESC').all() }));
  app.get('/api/admin/backups/:id/download', authRequired, adminRequired, (req, res) => {
    const b = db.prepare('SELECT * FROM backups WHERE id=?').get(req.params.id);
    if (!b) return res.status(404).json({ error: 'غير موجود' });
    res.download(path.join(bkDir, b.filename));
  });
  startScheduler();
}

module.exports = { mountPro, emitEvent, computeNext, buildBriefing };
