'use strict';
/* MODYX AI - Backend: Express + SQLite + JWT + pluggable AI provider. AI is called from backend only. */
const path = require('path');
require('dotenv').config();
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const multer = require('multer');

const { db, getSetting, setSetting } = require('./db');
const { sign, authRequired, adminRequired, adminLog, seedAdmin, adminPassOk } = require('./auth');
const { getUsage, bump, checkLimit } = require('./usage');
const { chatComplete, capabilities, MODELS } = require('./ai-provider');
const { webSearch } = require('./search');

const app = express();
const PORT = Number(process.env.PORT || 3000);
seedAdmin();

/* ---------- security & middleware ---------- */
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('tiny'));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 400, standardHeaders: true }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
const chatLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 });

const uploadDir = process.env.UPLOAD_DIR || (process.env.VERCEL ? '/tmp/modyx-uploads' : path.join(__dirname, '..', 'data', 'uploads'));
fs.mkdirSync(uploadDir, { recursive: true });
const ALLOWED = {
  '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv', '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
};
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
});
const upload = multer({
  storage,
  limits: { fileSize: Number(getSetting('max_upload_mb', process.env.MAX_UPLOAD_MB || '15')) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED[ext]) return cb(new Error('نوع الملف غير مدعوم. المسموح: TXT PDF DOCX XLSX CSV صور'));
    cb(null, true);
  },
});

const titleFrom = (t) => (t || '').replace(/\n/g, ' ').trim().slice(0, 60) || 'محادثة جديدة';

/* ---------- smart chat router: ChatGPT-style tools inside the conversation ---------- */
function detectIntent(text, opts = {}) {
  const t = String(text || '');
  const hasFile = Boolean(opts.hasFile);
  if (/اعمل(\s|ي|يلي|لى|ي\sلي)?.{0,30}موقع|أنشئ.{0,30}موقع|اصنع.{0,30}موقع|ابن(ي|يلي)?.{0,30}موقع|سو(ي|يلي)?.{0,30}موقع|صمم.{0,30}موقع|create|build|generate.{0,30}(website|web\s?site|landing(\spage)?|webpage)/i.test(t)) return 'website';
  if (!hasFile && /(ملف|مرفق|مستند|pdf|docx|xlsx)/i.test(t)) return 'file';
  if (/(ذكرني|فكرني|ذكرنى|remind(\s+me)?)/i.test(t)) return 'remind';
  if (/https?:\/\/\S+/.test(t) && /(لخص|حلل|اقرأ|ترجم|اشرح|ماه|ما\s|ايه|خبر|summar)/i.test(t)) return 'link';
  if (/(ارسم|أرسم|اصنع صورة|اعملي صورة|اعمل صورة|ولد صورة|ولّد صورة|تخيل|تخيّل|صمم صورة|generate image|draw me|draw a)/i.test(t) && !/(حلل|صف|اقرأ|اشرح)/.test(t)) return 'image';
  if (/(حلل|صِف|صف|اقرأ|اشرح).{0,25}(صورة|الصورة|الصوره)/i.test(t)) return 'vision';
  if (/^(ابحث|إبحث|دور|دوّر|سرش)\b/.test(t.trim()) || /(ابحث\sعن|إبحث\sعن|دور\s+عل[ىي]|آخر\sالأخبار|أحدث\sالأخبار|سعر\s(الدولار|الذهب|اليورو|البيتكوين)|نتيجة\sمباراة|what('| i)s\s+(the\s+)?latest|search\s+(the\s+)?web)/i.test(t)) return 'search';
  if (/```/.test(t) || /(اكتب(لي|ي)?|اعمل(ي|يلي)?|سو(ي|يلي)?|أنشئ|اصنع)\s.{0,25}(كود|دالة|برنامج|سكربت|سكريبت)|اشرح\s(هذا\s)?الكود|صحح\s(هذا\s)?الكود|صلح\sالكود|حسّن\sالكود|حوّل\s(هذا\s)?الكود|\bdebug\s+(this\s+)?code|explain\s+(this\s+)?code/i.test(t)) return 'code';
  if (/ترجم|translate/i.test(t)) return 'translate';
  if (/لخص|تلخيص|ملخص|summariz/i.test(t)) return 'summarize';
  if (/أعد\s(كتابة|صياغة)|اعادة\s(كتابة|صياغة)|إعادة\s(كتابة|صياغة)|rewrite|rephrase/i.test(t)) return 'rewrite';
  if (/اقترح|أفكار|افكار|فكرة|عايز\sفكرة|brainstorm/i.test(t)) return 'ideas';
  if (hasFile && /(ملف|مرفق|مستند|الملف|المرفق|حلل|pdf|docx|xlsx)/i.test(t)) return 'file';
  if (/(ملف|مرفق|مستند|حلل\s(الملف|المستند)|لخص\s(الملف|المستند))/i.test(t)) return 'file';
  return 'chat';
}
function extractQuery(t) {
  const m = String(t).match(/(?:ابحث\sعن|إبحث\sعن|دور\s+عل[ىي]|search\s+(?:the\s+web\s+)?for)\s+(.+)/i);
  return (m ? m[1] : t).trim().slice(0, 200);
}
/* Link reader with SSRF guard (http/https only, no private hosts, size-limited) */
async function readLink(url) {
  let u;
  try { u = new URL(url); } catch { throw new Error('رابط غير صالح'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('يُسمح بروابط http/https فقط');
  if (/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(u.hostname)) throw new Error('رابط محظور لأسباب أمنية');
  const r = await fetch(u.toString(), { headers: { 'User-Agent': 'MODYX-AI/1.0' }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`تعذر فتح الصفحة (${r.status})`);
  if (!/text|html/i.test(r.headers.get('content-type') || '')) throw new Error('الرابط ليس صفحة نصية');
  const html = (await r.text()).slice(0, 300000);
  const title = ((html.match(/<title[^>]*>([^<]{1,200})/i) || [])[1] || u.hostname).trim();
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 8000);
  if (text.length < 200) throw new Error('تعذر استخراج نص كافٍ من الصفحة');
  return { title, text, url: u.toString() };
}
/* Slash commands (/لخص /ترجم /كود /صورة /بحث /موقع /بريف ...) */
const SLASH = { 'لخص': 'summarize', 'ترجم': 'translate', 'صياغة': 'rewrite', 'كود': 'code', 'صورة': 'image', 'ارسم': 'image', 'بحث': 'search', 'ابحث': 'search', 'فكرة': 'ideas', 'أفكار': 'ideas', 'موقع': 'website', 'بريف': 'brief', 'رابط': 'link' };
const SLASH_HELP = '⚡ **أوامر MODYX السريعة:**\n/لخص + نص · /ترجم + نص · /صياغة + نص · /كود + وصف · /صورة + وصف · /بحث + سؤال · /موقع + وصف · /بريف + مدينة · /فكرة + موضوع';
function parseSlash(content) {
  const t = String(content || '').trim();
  if (!t.startsWith('/')) return null;
  const sp = t.indexOf(' ');
  const cmd = sp < 0 ? t.slice(1) : t.slice(1, sp);
  const rest = sp < 0 ? '' : t.slice(sp + 1).trim();
  if (cmd === 'مساعدة' || cmd === 'help') return { help: true };
  if (SLASH[cmd]) return { intent: SLASH[cmd], text: rest || t };
  return null;
}
/* Reminder time parser (Arabic) */
function parseReminderTime(t) {
  const now = new Date();
  let m;
  if (m = t.match(/بعد\s+(\d+)\s*(دقيقة|دقائق|دقايق)/)) return { at: new Date(now.getTime() + (+m[1]) * 60e3), label: `بعد ${m[1]} دقيقة` };
  if (/بعد\s+(نص|نصف)\s+ساعة/.test(t)) return { at: new Date(now.getTime() + 30 * 60e3), label: 'بعد نصف ساعة' };
  if (m = t.match(/بعد\s+ساعتين/)) return { at: new Date(now.getTime() + 2 * 3600e3), label: 'بعد ساعتين' };
  if (m = t.match(/بعد\s+(\d+)\s*ساع/)) return { at: new Date(now.getTime() + (+m[1]) * 3600e3), label: `بعد ${m[1]} ساعات` };
  if (/بعد\s+ساعة/.test(t)) return { at: new Date(now.getTime() + 3600e3), label: 'بعد ساعة' };
  if (m = t.match(/الساعة\s+(\d{1,2})(?::(\d{2}))?/)) {
    const d = new Date(now);
    const morrow = /(بكرة|بكرا|غدا|غدًا)/.test(t) && !/(اليوم|النهارده|النهاردة)/.test(t);
    if (morrow) d.setDate(d.getDate() + 1);
    d.setHours(+m[1], +(m[2] || 0), 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return { at: d, label: morrow ? `بكرة الساعة ${m[1]}` : `الساعة ${m[1]}` };
  }
  if (/(بكرة|بكرا|غدا|غدًا)/.test(t)) {
    const d = new Date(now); d.setDate(d.getDate() + 1);
    const hm = t.match(/الساعة\s+(\d{1,2})/);
    d.setHours(hm ? +hm[1] : 9, 0, 0, 0);
    return { at: d, label: 'بكرة ' + (hm ? `الساعة ${hm[1]}` : 'صباحًا') };
  }
  return null;
}
/* Follow-up question suggestions */
async function genFollowups(intent, reply, lang) {
  const cap = capabilities();
  if (cap.configured && cap.provider !== 'mock') {
    try {
      const r = await chatComplete({ messages: [{ role: 'system', content: 'اقترح 3 أسئلة متابعة قصيرة مرتبطة بالإجابة. أخرج كل سؤال في سطر فقط.' }, { role: 'user', content: String(reply).slice(0, 1500) }], lang });
      const out = r.text.split('\n').map(s => s.replace(/^[\d\-\.\)\s•\*]+/, '').trim()).filter(s => s.length > 3 && s.length < 120).slice(0, 3);
      if (out.length) return out;
    } catch {}
  }
  const F = {
    website: ['غيّر ألوان الموقع', 'أضف قسم تواصل', 'اجعله صفحة واحدة'],
    code: ['اشرح الكود سطرًا بسطر', 'حسّن أداء الكود', 'حوّله للغة أخرى'],
    image: ['ارسم نسخة أخرى', 'غيّر الأسلوب الفني', 'اجعلها واقعية أكثر'],
    search: ['ابحث بتفصيل أكثر', 'لخص أهم النتائج', 'ابحث عن مصادر عربية'],
    translate: ['ترجم نصًا آخر', 'اشرح الكلمات الصعبة'],
    summarize: ['استخرج أهم 3 نقاط', 'حوّل الملخص لخطة عمل'],
  };
  return F[intent] || ['بسّط الإجابة أكثر', 'أعطني مثالًا عمليًا', 'ما الخطوة التالية؟'];
}
/* Ready-made personalities */
const PERSONAS = {
  teacher: { name: 'المعلم 🎓', instructions: 'اشرح كل شيء بتبسيط وأمثلة وتمارين، كأنك معلم صبور.', personality: 'صبور ومشجع' },
  senior: { name: 'مبرمج Senior 💻', instructions: 'أجب كمهندس برمجيات خبير: أفضل الممارسات، كود نظيف، مراجعة صارمة.', personality: 'دقيق ومباشر' },
  marketer: { name: 'المسوّق 📣', instructions: 'أجب كخبير تسويق: عناوين جذابة، CTA واضح، لغة بيعية.', personality: 'حماسي ومقنع' },
  writer: { name: 'الكاتب ✍️', instructions: 'اكتب بلغة عربية فصيحة جميلة ومنظمة.', personality: 'أنيق ومبدع' },
  translator: { name: 'المترجم 🌍', instructions: 'ترجم باحترافية مع شرح الفروق الدقيقة بين اللغات.', personality: 'دقيق لغويًا' },
  coach: { name: 'الكوتش 🏋️', instructions: 'حفّز المستخدم بخطط عملية قصيرة ومتابعة وتحفيز.', personality: 'محفز وعملي' },
};
function langOf(t) {
  if (/بايثون|python/i.test(t)) return 'Python';
  if (/javascript|جافاسكريبت|js\b/i.test(t)) return 'JavaScript';
  if (/php/i.test(t)) return 'PHP';
  if (/c\+\+|سي\s?بلس/i.test(t)) return 'C++';
  if (/sql|سيكول|استعلام|قاعدة\sبيانات/i.test(t)) return 'SQL';
  if (/java(?!script)|جافا/i.test(t)) return 'Java';
  if (/html|صفحة\sويب/i.test(t)) return 'HTML/CSS/JS';
  return 'auto';
}
async function runChatTool({ intent, text, user, hasFile }) {
  if (intent === 'website') {
    const desc = String(text).slice(0, 2000);
    const files = websiteTemplate(desc);
    const plan = await chatComplete({ messages: [{ role: 'system', content: 'أنت Website Generator ضمن MODYX AI. اشرح هيكل الموقع المقترح (أقسام + ألوان) باختصار بالعربية.' }, { role: 'user', content: desc }], task: 'code_web', lang: user.lang });
    const reply = `تم يا بطل ⚡ — بنيت لك الموقع **داخل المحادثة**:\n\n${plan.text}\n\n- 👁 المعاينة الحية بالأسفل\n- 🛠 زر **فتح في Website Builder** للتعديل اليدوي والتنزيل\n- ✏️ تريد تعديلًا؟ اكتب مثلا: «اعملي موقع مطعم بألوان خضراء» وسأعيد البناء بالوصف الجديد`;
    return { reply, mode: plan.mode, provider: plan.provider, data: { type: 'website', desc: desc.slice(0, 300), files } };
  }
  if (intent === 'search') {
    const lim = checkLimit(user.id, 'searches');
    if (!lim.ok) throw Object.assign(new Error(`تجاوزت حد البحث اليومي (${lim.used}/${lim.limit})`), { status: 429 });
    const q = extractQuery(text);
    const out = await webSearch(q);
    bump(user.id, 'searches');
    const lines = out.results.slice(0, 4).map((r, i) => `${i + 1}. **${r.title}** (${r.source || ''})\n   ${String(r.snippet || '').slice(0, 180)}${r.url ? `\n   🔗 ${r.url}` : ''}`).join('\n');
    const reply = out.results.length
      ? `نتائج البحث عن **${q}** (محرك: ${out.engine}) ✅:\n\n${lines}\n\nالبطاقات الكاملة بالأسفل — وكل الروابط حقيقية من مصادرها.`
      : `لم أجد نتائج حقيقية عن **${q}** — جرّب صياغة أخرى. (لا أعرض روابط مخترعة)`;
    return { reply, mode: 'web-search', provider: out.engine, data: { type: 'search', q, engine: out.engine, results: out.results.slice(0, 6) } };
  }
  if (intent === 'code') {
    const t = String(text);
    const sub = /صحح|صلح|debug|خطأ|error/i.test(t) ? 'تصحيح الأخطاء' : /اشرح|explain/i.test(t) ? 'شرح الأكواد' : /حسّن|optimize|أداء/i.test(t) ? 'تحسين الكود' : /حوّل|convert/i.test(t) ? 'تحويل الكود' : 'توليد الكود';
    const language = langOf(t);
    const sys = { role: 'system', content: `أنت AI CODE EXPERT ضمن محادثة MODYX AI. المهمة: ${sub}. اللغة: ${language}. أجب بكود نظيف داخل كتلة واحدة + شرح مختصر + كيفية التشغيل. لا تخترع مكتبات غير حقيقية.` };
    const r = await chatComplete({ messages: [sys, { role: 'user', content: t.slice(0, 4000) }], task: 'code_generate', lang: user.lang });
    const m = r.text.match(/```(?:\w*)\n([\s\S]*?)```/);
    const reply = `💻 **${sub} (${language})** — نفّذته لك هنا:\n\n${r.text}\n\n- 📋 انسخ الكود بالزر أسفل الكتلة\n- 🛠 للتعديل المتقدم افتح تبويب **Code Expert**`;
    return { reply, mode: r.mode, provider: r.provider, data: m ? { type: 'code', language, code: m[1].slice(0, 8000) } : null };
  }
  if (intent === 'translate') {
    const target = /انجليز|english/i.test(text) ? 'الإنجليزية' : /فرنس|french/i.test(text) ? 'الفرنسية' : /عرب|arabic/i.test(text) ? 'العربية' : 'الإنجليزية';
    const r = await chatComplete({ messages: [{ role: 'system', content: `أنت مترجم محترف ضمن MODYX AI. ترجم النص التالي إلى ${target} باحترافية مع الحفاظ على المعنى والأسلوب.` }, { role: 'user', content: String(text).slice(0, 4000) }], lang: user.lang });
    return { reply: `🌍 **الترجمة إلى ${target}:**\n\n${r.text}`, mode: r.mode, provider: r.provider, data: null };
  }
  if (intent === 'summarize') {
    const r = await chatComplete({ messages: [{ role: 'system', content: 'أنت خبير تلخيص ضمن MODYX AI. لخص النص التالي في نقاط مركزة مع أهم الأفكار، بالعربية.' }, { role: 'user', content: String(text).slice(0, 6000) }], lang: user.lang });
    return { reply: `📝 **الملخص:**\n\n${r.text}`, mode: r.mode, provider: r.provider, data: null };
  }
  if (intent === 'rewrite') {
    const r = await chatComplete({ messages: [{ role: 'system', content: 'أنت خبير صياغة ضمن MODYX AI. أعد كتابة النص التالي بأسلوب محسّن احترافي مع الحفاظ على المعنى.' }, { role: 'user', content: String(text).slice(0, 6000) }], lang: user.lang });
    return { reply: `✍️ **إعادة الصياغة:**\n\n${r.text}`, mode: r.mode, provider: r.provider, data: null };
  }
  if (intent === 'ideas') {
    const r = await chatComplete({ messages: [{ role: 'system', content: 'أنت مولّد أفكار إبداعي ضمن MODYX AI. قدّم 7 أفكار عملية مرقمة مع خطوة بداية لكل فكرة، بالعربية.' }, { role: 'user', content: String(text).slice(0, 2000) }], lang: user.lang });
    return { reply: `💡 **أفكار مقترحة:**\n\n${r.text}`, mode: r.mode, provider: r.provider, data: null };
  }
  if (intent === 'image') {
    const m = String(text).match(/(?:ارسم|أرسم|اصنع\sصورة|اعمل(?:ي)?\sصورة|ولّد\sصورة|تخيّل|صمّم\sصورة|generate\s(?:an?\s+)?image\s?(?:of\s)?|draw\s.+?)(.+)/i);
    const prompt = (m ? m[1] : String(text)).trim().slice(0, 500) || String(text).slice(0, 500);
    const img = await generateImage(prompt);
    bump(user.id, 'images');
    try { db.prepare('INSERT INTO image_history(id,user_id,prompt,url,via) VALUES(?,?,?,?,?)').run(crypto.randomUUID(), user.id, prompt.slice(0, 500), img.url.slice(0, 2000), img.via); } catch {}
    const via = img.via === 'pollinations-free' ? 'توليد مجاني عبر Pollinations' : `توليد عبر مزود ${img.via}`;
    return { reply: `🎨 **تم توليد الصورة!** (${via})\n\nالوصف: ${prompt}`, mode: img.via === 'pollinations-free' ? 'image-free' : 'image-live', provider: img.via, data: { type: 'image', url: img.url, prompt } };
  }
  if (intent === 'vision') {
    const cap = capabilities();
    return { reply: `🖼️ **تحليل الصور:**\n\n${cap.vision ? 'ارفع الصورة من تبويب 🖼️ فهم الصور وسأحللها عبر نموذج الرؤية المتصل.' : cap.visionNote + '\n\nيمكنك رفع الصورة في تبويب 🖼️ فهم الصور لعرض خصائصها، أو اربط `AI_PROVIDER=openai` مع `AI_API_KEY` لتحليل حقيقي (وصف + نصوص + عناصر).'}`, mode: 'info', provider: 'modyx', data: null };
  }
  if (intent === 'link') {
    const url = (String(text).match(/https?:\/\/\S+/i) || [])[0] || '';
    try {
      const page = await readLink(url);
      const r = await chatComplete({ messages: [{ role: 'system', content: 'لخص محتوى الصفحة التالي في نقاط عربية مركزة مع أهم المعلومات.' }, { role: 'user', content: `عنوان الصفحة: ${page.title}\nالمحتوى:\n${page.text}` }], lang: user.lang });
      return { reply: `🔗 **ملخص الصفحة: ${page.title}**\n\n${r.text}`, mode: r.mode, provider: r.provider, data: { type: 'sources', q: page.title, results: [{ title: page.title, url: page.url, source: 'رابط مباشر' }] } };
    } catch (e) {
      return { reply: `⚠️ تعذر قراءة الرابط: ${e.message}`, mode: 'info', provider: 'modyx', data: null };
    }
  }
  if (intent === 'remind') {
    const when = parseReminderTime(text);
    if (!when) return { reply: '⏰ **حدد الوقت بوضوح** — مثال: «ذكرني بعد ساعة أشرب ماء» أو «فكرني بكرة الساعة 9 بالاجتماع».', mode: 'info', provider: 'modyx', data: null };
    let what = String(text).replace(/^(ذكرني|فكرني|ذكرنى)\s*(أن|انه|إن)?\s*/i, '').trim();
    what = what.replace(/^(بعد\s+(ساعة|ساعتين|\d+\s*\S+|نص\s+ساعة|نصف\s+ساعة)|الساعة\s+\d{1,2}(:\d{2})?|(بكرة|بكرا|غدا|غدًا|اليوم)[^\n]*)\s*/i, '').trim();
    what = what.replace(/(بعد\s+\S+(\s+\S+)?|الساعة\s+\d{1,2}(:\d{2})?|(بكرة|بكرا|غدا|غدًا|اليوم).*)$/i, '').trim() || 'تذكير';
    const sqlDT = when.at.toISOString().slice(0, 19).replace('T', ' ');
    db.prepare("INSERT INTO scheduled_tasks(id,user_id,title,prompt,schedule,repeat,next_run) VALUES(?,?,?,?,?,'once',?)")
      .run(crypto.randomUUID(), user.id, '⏰ ' + what.slice(0, 80), `تذكير للمستخدم: ${what}`, sqlDT, sqlDT);
    return { reply: `⏰ **تم! سأذكرك ${when.label}:** ${what}`, mode: 'info', provider: 'modyx', data: null };
  }
  if (intent === 'file') {
    if (!hasFile) return { reply: '📎 **ارفق الملف أولًا** بزر 📎 في المحادثة (TXT/PDF/DOCX/XLSX/CSV/صور) ثم اطلب مثلا: «لخص الملف» أو «حلل المستند».', mode: 'info', provider: 'modyx', data: null };
    const r = await chatComplete({ messages: [{ role: 'system', content: 'أنت محلل مستندات ضمن MODYX AI. أجب اعتمادًا على سياق الملف المرفق في المحادثة (يظهر ضمن رسالة المستخدم). إن كان السياق ناقصًا (مثل PDF/DOCX يعرض بيانات وصفية فقط) فصرّح بذلك بصدق.' }, { role: 'user', content: String(text).slice(0, 4000) }], lang: user.lang });
    return { reply: `📄 **تحليل الملف:**\n\n${r.text}`, mode: r.mode, provider: r.provider, data: null };
  }
  return null;
}

/* ---------- public ---------- */
app.get('/api/health', (req, res) => res.json({ ok: true, app: 'MODYX AI', time: new Date().toISOString() }));
app.get('/api/provider-status', (req, res) => res.json(capabilities()));
app.get('/api/models', (req, res) => res.json({ models: MODELS, capabilities: capabilities() }));

/* ---------- auth (email OR phone + password, Google OAuth) ---------- */
app.get('/api/auth/config', (req, res) => res.json({ google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET), requireLogin: true }));
app.post('/api/auth/register', authLimiter, (req, res) => {
  const { name, email, password, phone } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'الاسم والبريد وكلمة المرور مطلوبة' });
  if (String(password).length < 6) return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' });
  const em = String(email).toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return res.status(400).json({ error: 'البريد الإلكتروني غير صالح' });
  if (db.prepare('SELECT id FROM users WHERE email=?').get(em)) return res.status(409).json({ error: 'البريد مسجل مسبقًا — سجل الدخول' });
  const ph = String(phone || '').replace(/[\s-]/g, '');
  if (ph && !/^\+?\d{7,15}$/.test(ph)) return res.status(400).json({ error: 'رقم الهاتف غير صالح (7-15 رقمًا)' });
  if (ph && db.prepare('SELECT id FROM users WHERE phone=?').get(ph)) return res.status(409).json({ error: 'الهاتف مسجل مسبقًا — سجل الدخول' });
  const id = crypto.randomUUID();
  const hash = bcrypt.hashSync(String(password), 10);
  db.prepare('INSERT INTO users(id,name,email,password_hash,phone) VALUES(?,?,?,?,?)').run(id, String(name).slice(0, 60), em, hash, ph || '');
  // referral reward (both sides)
  try {
    const rc = String(req.body?.referral_code || '').trim().toUpperCase();
    if (rc) {
      const inv = db.prepare('SELECT * FROM referrals WHERE code=?').get(rc);
      if (inv && inv.user_id !== id) {
        const reward = Number(getSetting('credit_referral_reward', '200'));
        db.prepare('UPDATE referrals SET invites=invites+1,successful=successful+1 WHERE code=?').run(rc);
        db.prepare('UPDATE users SET credits=credits+? WHERE id=?').run(reward, inv.user_id);
        db.prepare('UPDATE users SET credits=credits+? WHERE id=?').run(reward, id);
        db.prepare('INSERT INTO credit_ledger(user_id,amount,reason) VALUES(?,?,?)').run(inv.user_id, reward, 'referral reward');
        db.prepare('INSERT INTO credit_ledger(user_id,amount,reason) VALUES(?,?,?)').run(id, reward, 'referral bonus');
      }
    }
  } catch {}
  const user = db.prepare('SELECT id,name,email,avatar,role,plan,plan_expires,lang,theme,bg_url,bg_opacity,created_at FROM users WHERE id=?').get(id);
  const token = sign({ id, email: em, role: 'user' });
  try { const p = jwt.decode(token); db.prepare('UPDATE sessions SET ua=?,ip=? WHERE jti=?').run(String(req.headers['user-agent'] || '').slice(0, 300), req.ip || '', p.jti); } catch {}
  res.cookie('modyx_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 864e5 });
  res.json({ token, user });
});
app.post('/api/auth/login', authLimiter, (req, res) => {
  const raw = String(req.body?.email || req.body?.identifier || '').trim();
  const { password } = req.body || {};
  // identifier: email OR phone
  let u;
  if (raw.includes('@')) u = db.prepare('SELECT * FROM users WHERE email=?').get(raw.toLowerCase());
  else u = db.prepare('SELECT * FROM users WHERE phone=?').get(raw.replace(/[\s-]/g, ''));
  if (!u || !u.password_hash || !bcrypt.compareSync(String(password || ''), u.password_hash)) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  if (u.blocked) return res.status(403).json({ error: 'تم حظر حسابك — تواصل مع الإدارة' });
  if (u.totp_enabled) {
    if (!totpVerify(u.totp_secret, req.body?.code)) return res.status(401).json({ error: '2FA', need2fa: true });
  }
  const token = sign(u);
  try { const p = jwt.decode(token); db.prepare('UPDATE sessions SET ua=?,ip=? WHERE jti=?').run(String(req.headers['user-agent'] || '').slice(0, 300), req.ip || '', p.jti); } catch {}
  res.cookie('modyx_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 864e5 });
  const { password_hash, blocked, ...safe } = u;
  res.json({ token, user: safe });
});
app.post('/api/auth/logout', (req, res) => { res.clearCookie('modyx_token'); res.json({ ok: true }); });
app.get('/api/auth/me', authRequired, (req, res) => res.json({ user: req.user }));
app.put('/api/auth/me', authRequired, (req, res) => {
  const { name, lang, theme, avatar, bg_url, bg_opacity } = req.body || {};
  db.prepare('UPDATE users SET name=COALESCE(?,name), lang=COALESCE(?,lang), theme=COALESCE(?,theme), avatar=COALESCE(?,avatar), bg_url=COALESCE(?,bg_url), bg_opacity=COALESCE(?,bg_opacity) WHERE id=?')
    .run(name?.slice(0, 60) ?? null, lang ?? null, theme ?? null, avatar?.slice(0, 200000) ?? null, bg_url?.slice(0, 500) ?? null, bg_opacity ?? null, req.user.id);
  res.json({ user: db.prepare('SELECT id,name,email,avatar,role,plan,plan_expires,lang,theme,bg_url,bg_opacity,created_at FROM users WHERE id=?').get(req.user.id) });
});
app.delete('/api/auth/me', authRequired, (req, res) => {
  const uid = req.user.id;
  db.prepare('DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id=?)').run(uid);
  db.prepare('DELETE FROM conversations WHERE user_id=?').run(uid);
  db.prepare('DELETE FROM files WHERE user_id=?').run(uid);
  db.prepare('DELETE FROM usage WHERE user_id=?').run(uid);
  db.prepare('DELETE FROM users WHERE id=?').run(uid);
  res.clearCookie('modyx_token');
  res.json({ ok: true });
});

/* ---------- conversations & chat ---------- */
app.get('/api/conversations', authRequired, (req, res) => {
  const q = (req.query.q || '').trim();
  const filter = req.query.filter || 'all'; // all | pinned | archived
  const page = Math.max(1, Number(req.query.page || 1));
  const per = 20;
  let cond = 'user_id=?', args = [req.user.id];
  if (filter === 'pinned') cond += ' AND pinned=1 AND archived=0';
  else if (filter === 'archived') cond += ' AND archived=1';
  else cond += ' AND archived=0';
  if (q) { cond += ' AND title LIKE ?'; args.push(`%${q}%`); }
  const rows = db.prepare(`SELECT * FROM conversations WHERE ${cond} ORDER BY pinned DESC, updated_at DESC LIMIT ? OFFSET ?`).all(...args, per, (page - 1) * per);
  res.json({ conversations: rows, page });
});
app.post('/api/conversations', authRequired, (req, res) => {
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO conversations(id,user_id,title,model) VALUES(?,?,?,?)').run(id, req.user.id, 'محادثة جديدة', req.body?.model || '');
  res.json({ id });
});
app.get('/api/conversations/:id', authRequired, (req, res) => {
  const c = db.prepare('SELECT * FROM conversations WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!c) return res.status(404).json({ error: 'المحادثة غير موجودة' });
  const msgs = db.prepare('SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at ASC').all(c.id);
  const files = db.prepare('SELECT id,original_name,mime,size,kind,created_at FROM files WHERE conversation_id=?').all(c.id);
  res.json({ conversation: c, messages: msgs, files });
});
app.delete('/api/conversations/:id', authRequired, (req, res) => {
  db.prepare('DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE id=? AND user_id=?)').run(req.params.id, req.user.id);
  db.prepare('DELETE FROM conversations WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});
app.put('/api/conversations/:id', authRequired, (req, res) => {
  const { title, pinned, archived, mode, project_id, team_id } = req.body || {};
  const c = db.prepare('SELECT * FROM conversations WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!c) return res.status(404).json({ error: 'المحادثة غير موجودة' });
  db.prepare('UPDATE conversations SET title=COALESCE(?,title), pinned=COALESCE(?,pinned), archived=COALESCE(?,archived), mode=COALESCE(?,mode), project_id=COALESCE(?,project_id), team_id=COALESCE(?,team_id) WHERE id=?')
    .run(title?.slice(0, 80) ?? null, pinned ?? null, archived ?? null, mode ?? null, project_id ?? null, team_id ?? null, req.params.id);
  res.json({ ok: true });
});
/* share chat via public token link */
app.post('/api/conversations/:id/share', authRequired, (req, res) => {
  const c = db.prepare('SELECT * FROM conversations WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!c) return res.status(404).json({ error: 'المحادثة غير موجودة' });
  const token = c.shared_token || crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  db.prepare('UPDATE conversations SET shared_token=? WHERE id=?').run(token, c.id);
  res.json({ ok: true, token, url: `/api/shared/${token}` });
});
app.post('/api/conversations/:id/unshare', authRequired, (req, res) => {
  db.prepare("UPDATE conversations SET shared_token='' WHERE id=? AND user_id=?").run(req.params.id, req.user.id);
  res.json({ ok: true });
});
app.get('/api/shared/:token', (req, res) => {
  const c = db.prepare('SELECT id,title,created_at FROM conversations WHERE shared_token=?').get(req.params.token);
  if (!c) return res.status(404).json({ error: 'رابط المشاركة غير صالح' });
  const msgs = db.prepare('SELECT role,content,created_at FROM messages WHERE conversation_id=? ORDER BY created_at ASC').all(c.id);
  res.json({ title: c.title, messages: msgs });
});
/* branch: fork conversation from a message (conversation branches) */
app.post('/api/conversations/:id/branch', authRequired, (req, res) => {
  const c = db.prepare('SELECT * FROM conversations WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!c) return res.status(404).json({ error: 'المحادثة غير موجودة' });
  const { message_id } = req.body || {};
  const msgs = db.prepare('SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at ASC').all(c.id);
  let cut = msgs;
  if (message_id) {
    const i = msgs.findIndex(m => m.id === message_id);
    if (i >= 0) cut = msgs.slice(0, i + 1);
  }
  const nid = crypto.randomUUID();
  db.prepare('INSERT INTO conversations(id,user_id,title,model,mode,branch_from) VALUES(?,?,?,?,?,?)').run(nid, req.user.id, c.title + ' (فرع)', c.model, c.mode || 'smart', c.id);
  const ins = db.prepare('INSERT INTO messages(id,conversation_id,role,content,meta) VALUES(?,?,?,?,?)');
  for (const m of cut) ins.run(crypto.randomUUID(), nid, m.role, m.content, m.meta || '{}');
  res.json({ ok: true, id: nid });
});
/* edit own message: update + drop everything after it */
app.put('/api/messages/:id', authRequired, (req, res) => {
  const m = db.prepare('SELECT m.* FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=? AND c.user_id=?').get(req.params.id, req.user.id);
  if (!m) return res.status(404).json({ error: 'الرسالة غير موجودة' });
  const content = String(req.body?.content || '').slice(0, 12000);
  if (!content.trim()) return res.status(400).json({ error: 'النص فارغ' });
  db.prepare('UPDATE messages SET content=? WHERE id=?').run(content, m.id);
  db.prepare("DELETE FROM messages WHERE conversation_id=? AND created_at>? AND id<>?").run(m.conversation_id, m.created_at, m.id);
  res.json({ ok: true });
});

/* Image generation helper: live provider if configured, else free Pollinations (honestly labeled) */
async function generateImage(prompt) {
  const cap = capabilities();
  if (cap.configured && (cap.provider === 'openai' || cap.provider === 'openai-compatible')) {
    try {
      const base = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
      const r = await fetch(`${base}/images/generations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AI_API_KEY}` },
        body: JSON.stringify({ model: process.env.AI_IMAGE_MODEL || 'dall-e-3', prompt: String(prompt).slice(0, 1000), size: '1024x1024', response_format: 'b64_json' }),
      });
      if (r.ok) {
        const j = await r.json();
        const b64 = j.data?.[0]?.b64_json;
        if (b64) return { url: `data:image/png;base64,${b64}`, via: cap.provider };
      }
    } catch { /* fall through to free tier */ }
  }
  const seed = Math.floor(Math.random() * 1e9);
  return { url: `https://image.pollinations.ai/prompt/${encodeURIComponent(String(prompt).slice(0, 500))}?width=1024&height=1024&nologo=true&seed=${seed}`, via: 'pollinations-free' };
}

/* Permanent memory: facts + auto-learn name */
function memoriesOf(userId) {
  try { return db.prepare('SELECT id,fact,created_at FROM memories WHERE user_id=? ORDER BY created_at DESC LIMIT 20').all(userId); }
  catch { return []; }
}
function learnFrom(text, user) {
  const t = String(text || '');
  const nm = t.match(/اسمي\s+([^\s،,.!?؛:]+)/);
  if (nm && nm[1].length >= 2 && nm[1].length <= 30) {
    db.prepare('UPDATE users SET name=? WHERE id=?').run(nm[1], user.id);
    try { db.prepare('INSERT INTO memories(id,user_id,fact) VALUES(?,?,?)').run(crypto.randomUUID(), user.id, `اسم المستخدم: ${nm[1]}`); } catch {}
  }
  const sv = t.match(/(?:تذكر|احفظ|افتكر|تذكري)\s+أن(?:ي)?\s+(.+)/);
  if (sv && sv[1].trim().length >= 3) {
    try { db.prepare('INSERT INTO memories(id,user_id,fact) VALUES(?,?,?)').run(crypto.randomUUID(), user.id, sv[1].trim().slice(0, 300)); } catch {}
  }
}

function historyFor(convId, limit = 30) {
  const rows = db.prepare('SELECT role,content FROM messages WHERE conversation_id=? ORDER BY created_at DESC LIMIT ?').all(convId, limit).reverse();
  return rows.map(r => ({ role: r.role, content: r.content }));
}

const MODES = {
  fast: { name: 'MODYX Fast', hint: 'أجب باختصار شديد وسرعة، بدون مقدمات.' },
  smart: { name: 'MODYX Smart', hint: '' },
  pro: { name: 'MODYX Pro', hint: 'أجب بتفصيل معمق منظم مع أمثلة.' },
  code: { name: 'MODYX Code', hint: 'أنت AI CODE EXPERT: أجب بكود نظيف داخل كتلة + شرح + تشغيل.' },
  vision: { name: 'MODYX Vision', hint: '' },
  research: { name: 'MODYX Research', hint: '' },
  agent: { name: 'MODYX Agent', hint: '' },
};
function modeAvailable(key, cap) {
  if (key === 'vision') return { ok: cap.vision, note: cap.visionNote };
  return { ok: true, note: '' };
}
async function quickResearch(text, user) {
  const q = String(text).slice(0, 300);
  const a = await webSearch(q);
  const b = await webSearch(q + ' تفاصيل شرح');
  bump(user.id, 'searches'); bump(user.id, 'searches');
  const seen = new Map();
  for (const r of [...a.results, ...b.results]) if (r.url && !seen.has(r.url)) seen.set(r.url, r);
  const src = [...seen.values()].slice(0, 6);
  const ctx = src.map((r, i) => `[${i + 1}] ${r.title} (${r.source}): ${String(r.snippet || '').slice(0, 300)} — ${r.url}`).join('\n');
  const rep = await chatComplete({ messages: [{ role: 'system', content: 'أنت باحث MODYX Research. من المصادر التالية أنشئ تقريرًا منظمًا: الخلاصة، التفاصيل، المقارنة، الاستنتاج. اذكر رقم المصدر [1] بجانب كل معلومة خارجية. لا تخترع مصادر.' }, { role: 'user', content: `السؤال: ${q}\nالمصادر:\n${ctx || 'لا مصادر'}` }], lang: user.lang });
  const reply = src.length ? `🔬 **تقرير بحثي: ${q}**\n\n${rep.text}` : `لم أجد مصادر خارجية حقيقية عن **${q}** — التقرير أدناه من المعرفة العامة:\n\n${rep.text}`;
  return { reply, mode: rep.mode, provider: rep.provider, data: { type: 'sources', q, results: src } };
}
async function quickAgent(text, user) {
  const t = String(text).slice(0, 2000);
  const plan = await chatComplete({ messages: [{ role: 'system', content: 'أنت Research Agent ضمن MODYX Agent. حلل المهمة وقسمها لخطوات مرقمة باختصار.' }, { role: 'user', content: t }], lang: user.lang });
  const exec = await chatComplete({ messages: [{ role: 'system', content: 'أنت Coding/Writer Agent ضمن MODYX Agent. نفّذ المهمة عمليًا (كود أو نص) بناء على الخطة.' }, { role: 'user', content: `المهمة: ${t}\nالخطة:\n${plan.text}` }], task: 'code_generate', lang: user.lang });
  const rev = await chatComplete({ messages: [{ role: 'system', content: 'أنت Reviewer Agent ضمن MODYX Agent. راجع النتيجة: أخطاء + تحسينات مقترحة باختصار.' }, { role: 'user', content: exec.text.slice(0, 3000) }], lang: user.lang });
  const reply = `🤖 **نتيجة MODYX Agent**\n\n**1) التحليل (Research Agent):**\n${plan.text}\n\n**2) التنفيذ (Coding/Writer Agent):**\n${exec.text}\n\n**3) المراجعة (Reviewer Agent):**\n${rev.text}`;
  return { reply, mode: exec.mode, provider: exec.provider, data: null };
}
async function processMessage(c, user, { content, model, fileContext, mode, assistant }) {
  if (getSetting('credits_enabled', '1') === '1') {
    const cost = Number(getSetting('credit_cost_message', '1'));
    const bal = db.prepare('SELECT credits FROM users WHERE id=?').get(user.id)?.credits ?? 0;
    if (bal < cost) throw Object.assign(new Error('رصيد Credits غير كافٍ — اشحن رصيدك أو راجع الإدارة'), { status: 402 });
  }
  const userText = String(content).slice(0, 12000) + (fileContext ? `\n\n[سياق ملف مرفق]\n${String(fileContext).slice(0, 6000)}` : '');
  db.prepare('INSERT INTO messages(id,conversation_id,role,content,meta) VALUES(?,?,?,?,?)')
    .run(crypto.randomUUID(), c.id, 'user', userText, JSON.stringify({ model: model || '' }));
  if (c.title === 'محادثة جديدة') db.prepare('UPDATE conversations SET title=? WHERE id=?').run(titleFrom(content), c.id);
  learnFrom(content, user);

  if (mode && MODES[mode]) db.prepare('UPDATE conversations SET mode=? WHERE id=?').run(mode, c.id);
  const effMode = (mode && MODES[mode]) ? mode : (MODES[c.mode] ? c.mode : 'smart');
  const cap = capabilities();
  const avail = modeAvailable(effMode, cap);
  let assistantSys = '';
  if (assistant) {
    try {
      const a = db.prepare("SELECT * FROM custom_ai WHERE id=? AND (owner_id=? OR visibility='public')").get(assistant, user.id);
      if (a) assistantSys = `\nشخصية مخصصة (${a.name}): ${a.instructions} الطبع: ${a.personality}`;
    } catch {}
  }
  const mem = memoriesOf(user.id).map(r => r.fact);
  const modeHint = MODES[effMode].hint ? `\nوضع ${MODES[effMode].name}: ${MODES[effMode].hint}` : '';
  const sys = { role: 'system', content: 'أنت MODYX AI — مساعد عربي ذكي داخل محادثة موحدة تشبه ChatGPT. تجيب على الأسئلة، وتكتب الأكواد وتشرحها، وتلخص وتترجم وتعيد الصياغة وتولّد الأفكار. النظام ينفّذ بناء المواقع والبحث وتوليد الصور تلقائيًا عند طلبها، فلا تدّعِ تنفيذ ما لم يُطلب. لا تخترع مصادر أو روابط. إن لم تتوفر قدرة (رؤية/بحث حي/صوت سحابي) فصرّح بذلك بصدق.' + modeHint + assistantSys + (mem.length ? `\nحقائق ثابتة عن المستخدم (استخدمها عند الحاجة): ${mem.join(' | ')}` : '') };
  let result, widget = null, usedIntent = 'chat', usedText = String(content);
  const slash = parseSlash(content);
  if (slash?.help) {
    result = { text: SLASH_HELP, mode: 'info', provider: 'modyx' };
  } else {
    if (slash) { usedIntent = slash.intent; usedText = slash.text; }
    const intent = usedIntent !== 'chat' ? usedIntent : detectIntent(usedText, { hasFile: Boolean(fileContext) });
    usedIntent = intent;
  if (intent !== 'chat') {
    try {
      if (intent === 'brief') {
        const { buildBriefing } = require('./pro');
        const b = await buildBriefing(usedText.slice(0, 60) || 'القاهرة', user);
        result = { text: `🌅 **البريف الصباحي:**\n\n${b}`, mode: 'brief', provider: 'modyx' };
      } else {
        const tool = await runChatTool({ intent, text: usedText, user, hasFile: Boolean(fileContext) });
        if (tool) { result = { text: tool.reply, mode: tool.mode, provider: tool.provider }; widget = tool.data; }
      }
    } catch (e) {
      if (e.status === 429 || e.status === 402) throw e;
    }
  }
  }
  if (!result && effMode === 'research' && !avail.note) {
    try { const r = await quickResearch(content, user); result = { text: r.reply, mode: r.mode, provider: r.provider }; widget = r.data; } catch (e) { if (e.status === 429 || e.status === 402) throw e; }
  }
  if (!result && effMode === 'agent') {
    try { const r = await quickAgent(content, user); result = { text: r.reply, mode: r.mode, provider: r.provider }; widget = r.data; } catch (e) { if (e.status === 429 || e.status === 402) throw e; }
  }
  if (!result && effMode === 'vision') {
    const cap2 = capabilities();
    result = { text: cap2.vision ? '🖼️ ارفع الصورة من زر 📎 أو تبويب الصور وسأحللها بنموذج الرؤية.' : '🖼️ ' + cap2.visionNote + ' اربط مزود رؤية للتحليل الحقيقي.', mode: 'info', provider: 'modyx' };
  }
  if (!result) result = await chatComplete({ messages: [sys, ...historyFor(c.id)], model, lang: user.lang });
  let followups = [];
  try { followups = await genFollowups(usedIntent, result.text, user.lang); } catch {}
  db.prepare('INSERT INTO messages(id,conversation_id,role,content,meta) VALUES(?,?,?,?,?)')
    .run(crypto.randomUUID(), c.id, 'assistant', result.text, JSON.stringify({ mode: result.mode, provider: result.provider, widget }));
  db.prepare('UPDATE conversations SET updated_at=datetime(\'now\'), model=? WHERE id=?').run(model || c.model || '', c.id);
  bump(user.id, 'messages');
  // credits system (admin-adjustable)
  if (getSetting('credits_enabled', '1') === '1') {
    const cost = Number(getSetting('credit_cost_message', '1'));
    db.prepare('UPDATE users SET credits=credits-? WHERE id=?').run(cost, user.id);
    db.prepare('INSERT INTO credit_ledger(user_id,amount,reason) VALUES(?, ?, ?)').run(user.id, -cost, 'chat message');
  }
  return { reply: result.text, mode: result.mode, provider: result.provider, widget, followups, usage: getUsage(user.id) };
}

app.post('/api/conversations/:id/messages', authRequired, chatLimiter, async (req, res) => {
  const c = db.prepare('SELECT * FROM conversations WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!c) return res.status(404).json({ error: 'المحادثة غير موجودة' });
  const { content, model, fileContext, mode, assistant } = req.body || {};
  if (!content || !String(content).trim()) return res.status(400).json({ error: 'اكتب رسالتك أولًا' });
  const lim = checkLimit(req.user.id, 'messages');
  if (!lim.ok) return res.status(429).json({ error: `تجاوزت حد الرسائل اليومي (${lim.used}/${lim.limit}) — خطتك: ${lim.plan}` });
  try {
    res.json(await processMessage(c, req.user, { content, model, fileContext, mode, assistant }));
  } catch (e) {
    if (e.status === 429) return res.status(429).json({ error: e.message });
    if (e.status === 402) return res.status(402).json({ error: e.message });
    throw e;
  }
});

/* Streaming replies (progressive rendering, ChatGPT feel) */
app.post('/api/conversations/:id/stream', authRequired, chatLimiter, async (req, res) => {
  const c = db.prepare('SELECT * FROM conversations WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!c) return res.status(404).json({ error: 'المحادثة غير موجودة' });
  const { content, model, fileContext, mode, assistant } = req.body || {};
  if (!content || !String(content).trim()) return res.status(400).json({ error: 'اكتب رسالتك أولًا' });
  const lim = checkLimit(req.user.id, 'messages');
  if (!lim.ok) return res.status(429).json({ error: `تجاوزت حد الرسائل اليومي (${lim.used}/${lim.limit})` });
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  try {
    const out = await processMessage(c, req.user, { content, model, fileContext, mode, assistant });
    const text = out.reply;
    for (let i = 0; i < text.length; i += 24) {
      send({ token: text.slice(i, i + 24) });
      await new Promise(r => setTimeout(r, 18));
    }
    send({ done: true, mode: out.mode, provider: out.provider, widget: out.widget, followups: out.followups || [], usage: out.usage });
  } catch (e) {
    send({ error: e.message || 'خطأ أثناء التوليد' });
  }
  res.end();
});

/* summarize a long conversation */
app.post('/api/conversations/:id/summarize', authRequired, chatLimiter, async (req, res) => {
  const c = db.prepare('SELECT * FROM conversations WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!c) return res.status(404).json({ error: 'المحادثة غير موجودة' });
  const msgs = db.prepare('SELECT role,content FROM messages WHERE conversation_id=? ORDER BY created_at ASC LIMIT 100').all(c.id);
  if (msgs.length < 4) return res.status(400).json({ error: 'المحادثة قصيرة — لا تحتاج تلخيصًا' });
  const r = await chatComplete({ messages: [{ role: 'system', content: 'لخص المحادثة التالية: أهم الأسئلة والإجابات والقرارات، في نقاط عربية مركزة.' }, { role: 'user', content: msgs.map(m => `${m.role}: ${m.content}`.slice(0, 500)).join('\n').slice(0, 12000) }], lang: req.user.lang });
  db.prepare('INSERT INTO messages(id,conversation_id,role,content,meta) VALUES(?,?,?,?,?)')
    .run(crypto.randomUUID(), c.id, 'assistant', `📝 **ملخص المحادثة:**\n\n${r.text}`, JSON.stringify({ mode: 'summary', provider: r.provider }));
  bump(req.user.id, 'messages');
  res.json({ reply: `📝 **ملخص المحادثة:**\n\n${r.text}`, mode: 'summary' });
});
/* ready-made personalities → custom AI */
app.post('/api/assistants/preset', authRequired, (req, res) => {
  const p = PERSONAS[String(req.body?.key || '')];
  if (!p) return res.status(400).json({ error: 'شخصية غير معروفة', available: Object.keys(PERSONAS) });
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO custom_ai(id,owner_id,name,avatar,instructions,personality,visibility) VALUES(?,?,?,?,?,?,'private')")
    .run(id, req.user.id, p.name, '🧑‍🎨', p.instructions, p.personality);
  res.json({ ok: true, id });
});
app.get('/api/personas', authRequired, (req, res) => res.json({ personas: Object.entries(PERSONAS).map(([k, v]) => ({ key: k, ...v })) }));
/* learn my writing style */
app.post('/api/style/learn', authRequired, chatLimiter, async (req, res) => {
  const rows = db.prepare('SELECT content FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.user_id=? AND m.role=\'user\' ORDER BY m.created_at DESC LIMIT 30').all(req.user.id);
  if (rows.length < 3) return res.status(400).json({ error: 'تحدث أكثر أولًا (3 رسائل على الأقل) لأتعلم أسلوبك' });
  const r = await chatComplete({ messages: [{ role: 'system', content: 'حلل رسائل المستخدم التالية واستخرج ملامح أسلوبه (الطول، اللهجة، الرسمية، الاهتمامات) في 3 سطور عربية تبدأ بـ "أسلوب المستخدم:".' }, { role: 'user', content: rows.map(x => x.content.slice(0, 300)).join('\n---\n').slice(0, 6000) }], lang: req.user.lang });
  db.prepare('DELETE FROM memories WHERE user_id=? AND fact LIKE \'أسلوب المستخدم:%\'').run(req.user.id);
  db.prepare('INSERT INTO memories(id,user_id,fact) VALUES(?,?,?)').run(crypto.randomUUID(), req.user.id, r.text.slice(0, 500));
  res.json({ ok: true, profile: r.text });
});
app.get('/api/memory', authRequired, (req, res) => res.json({ memories: memoriesOf(req.user.id) }));
app.post('/api/memory', authRequired, (req, res) => {
  const fact = String(req.body?.fact || '').trim().slice(0, 300);
  if (!fact) return res.status(400).json({ error: 'اكتب المعلومة أولًا' });
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO memories(id,user_id,fact) VALUES(?,?,?)').run(id, req.user.id, fact);
  res.json({ ok: true, id });
});
app.delete('/api/memory/:id', authRequired, (req, res) => {
  db.prepare('DELETE FROM memories WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

/* ---------- AI modes (honest availability) ---------- */
app.get('/api/modes', authRequired, (req, res) => {
  const cap = capabilities();
  res.json({ modes: Object.entries(MODES).map(([id, m]) => ({ id, name: m.name, ...modeAvailable(id, cap) })) });
});

/* ---------- sessions & devices ---------- */
app.get('/api/sessions', authRequired, (req, res) => {
  res.json({ sessions: db.prepare('SELECT jti,ua,ip,revoked,created_at,last_seen FROM sessions WHERE user_id=? ORDER BY last_seen DESC LIMIT 30').all(req.user.id) });
});
app.post('/api/sessions/revoke', authRequired, (req, res) => {
  const { jti } = req.body || {};
  if (!jti) return res.status(400).json({ error: 'حدد الجلسة' });
  db.prepare('UPDATE sessions SET revoked=1 WHERE jti=? AND user_id=?').run(jti, req.user.id);
  adminLog(req.user.id, 'session_revoke', jti);
  res.json({ ok: true });
});

/* ---------- 2FA (TOTP, no external service) ---------- */
function b32dec(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let v = 0, n = 0; const out = [];
  for (const ch of String(s).toUpperCase().replace(/=+$/, '')) {
    const i = A.indexOf(ch); if (i < 0) continue;
    v = (v << 5) | i; n += 5;
    if (n >= 8) { out.push((v >>> (n - 8)) & 255); n -= 8; }
  }
  return Buffer.from(out);
}
function totp(secret, step = 30, t = Date.now()) {
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(Math.floor(t / 1000 / step)));
  const h = crypto.createHmac('sha1', b32dec(secret)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}
function totpVerify(secret, code) {
  const s = String(code || '').replace(/\s/g, '');
  return [-1, 0, 1].some(d => totp(secret, 30, Date.now() + d * 30000) === s);
}
app.post('/api/2fa/setup', authRequired, (req, res) => {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let secret = '';
  for (const x of crypto.randomBytes(20)) secret += A[x % 32];
  db.prepare('UPDATE users SET totp_secret=? WHERE id=?').run(secret, req.user.id);
  const iss = getSetting('totp_issuer', 'MODYX AI');
  res.json({ secret, otpauth_url: `otpauth://totp/${encodeURIComponent(iss)}:${encodeURIComponent(req.user.email)}?secret=${secret}&issuer=${encodeURIComponent(iss)}` });
});
app.post('/api/2fa/enable', authRequired, (req, res) => {
  const u = db.prepare('SELECT totp_secret FROM users WHERE id=?').get(req.user.id);
  if (!u?.totp_secret || !totpVerify(u.totp_secret, req.body?.code)) return res.status(400).json({ error: 'رمز التحقق غير صحيح' });
  db.prepare('UPDATE users SET totp_enabled=1 WHERE id=?').run(req.user.id);
  res.json({ ok: true });
});
app.post('/api/2fa/disable', authRequired, (req, res) => {
  const u = db.prepare('SELECT totp_secret,totp_enabled FROM users WHERE id=?').get(req.user.id);
  if (u.totp_enabled && !totpVerify(u.totp_secret, req.body?.code)) return res.status(400).json({ error: 'رمز التحقق غير صحيح' });
  db.prepare("UPDATE users SET totp_enabled=0,totp_secret='' WHERE id=?").run(req.user.id);
  res.json({ ok: true });
});

/* ---------- Google OAuth (requires GOOGLE_CLIENT_ID/SECRET) ---------- */
app.get('/api/auth/google', (req, res) => {
  const cid = process.env.GOOGLE_CLIENT_ID || '';
  if (!cid) return res.status(400).json({ error: 'دخول Google غير مفعّل — أضف GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET في .env (Google Cloud Console ← OAuth client ← Web).' });
  const redirect = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
  const q = new URLSearchParams({ client_id: cid, redirect_uri: redirect, response_type: 'code', scope: 'openid email profile', access_type: 'online', prompt: 'select_account' });
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + q.toString());
});
app.get('/api/auth/google/callback', authLimiter, async (req, res) => {
  try {
    const cid = process.env.GOOGLE_CLIENT_ID || '', sec = process.env.GOOGLE_CLIENT_SECRET || '';
    if (!cid || !sec || !req.query.code) throw new Error('إعدادات Google ناقصة');
    const redirect = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
    const tk = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: String(req.query.code), client_id: cid, client_secret: sec, redirect_uri: redirect, grant_type: 'authorization_code' }),
    }).then(r => r.json());
    if (!tk.access_token) throw new Error('فشل التحقق من Google');
    const me = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${tk.access_token}` } }).then(r => r.json());
    if (!me.email) throw new Error('تعذر قراءة حساب Google');
    const em = String(me.email).toLowerCase();
    let u = db.prepare('SELECT * FROM users WHERE email=?').get(em);
    if (!u) {
      const id = crypto.randomUUID();
      db.prepare('INSERT INTO users(id,name,email,password_hash,google_id,avatar) VALUES(?,?,?,?,?,?)')
        .run(id, String(me.name || em.split('@')[0]).slice(0, 60), em, bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10), String(me.sub || ''), String(me.picture || '').slice(0, 500));
      u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
    } else if (!u.google_id && me.sub) {
      db.prepare('UPDATE users SET google_id=? WHERE id=?').run(String(me.sub), u.id);
    }
    if (u.blocked) return res.redirect('/?err=blocked');
    const token = sign(u);
    try { const p = jwt.decode(token); db.prepare('UPDATE sessions SET ua=?,ip=? WHERE jti=?').run('google-oauth', req.ip || '', p.jti); } catch {}
    res.redirect('/#token=' + token);
  } catch (e) {
    res.redirect('/?err=' + encodeURIComponent('Google: ' + e.message));
  }
});
/* ---------- hidden admin unlock (•••): role + password + lockout, backend-enforced ---------- */
const unlockLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20 });
app.post('/api/admin/unlock', unlockLimiter, authRequired, (req, res) => {
  const ip = req.ip || 'unknown';
  const att = db.prepare('SELECT * FROM admin_attempts WHERE ip=?').get(ip);
  if (att?.locked_until && att.locked_until > new Date().toISOString()) return res.status(429).json({ error: 'محظور مؤقتًا — حاول بعد 10 دقائق' });
  const ok = req.user.role === 'admin' && adminPassOk(req.body?.password);
  if (!ok) {
    const n = (att?.count || 0) + 1;
    const lock = n >= 5 ? new Date(Date.now() + 10 * 60e3).toISOString() : '';
    db.prepare('INSERT INTO admin_attempts(ip,count,locked_until) VALUES(?,?,?) ON CONFLICT(ip) DO UPDATE SET count=excluded.count,locked_until=excluded.locked_until').run(ip, n, lock);
    return res.status(403).json({ error: 'فشل التحقق' });
  }
  db.prepare('DELETE FROM admin_attempts WHERE ip=?').run(ip);
  adminLog(req.user.id, 'admin_unlock', 'ok');
  res.json({ ok: true });
});

/* ---------- feedback on AI answers ---------- */
app.post('/api/feedback', authRequired, chatLimiter, (req, res) => {
  const { message_id, rating, comment } = req.body || {};
  if (![1, -1].includes(Number(rating))) return res.status(400).json({ error: 'تقييم غير صالح' });
  const m = db.prepare('SELECT m.* FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=? AND c.user_id=?').get(message_id, req.user.id);
  if (!m) return res.status(404).json({ error: 'الرسالة غير موجودة' });
  const meta = (() => { try { return JSON.parse(m.meta || '{}'); } catch { return {}; } })();
  db.prepare("INSERT INTO feedback(id,message_id,user_id,rating,comment,model) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING")
    .run(crypto.randomUUID(), message_id, req.user.id, Number(rating), String(comment || '').slice(0, 500), meta.provider || '');
  res.json({ ok: true });
});

app.post('/api/conversations/:id/regenerate', authRequired, chatLimiter, async (req, res) => {
  const c = db.prepare('SELECT * FROM conversations WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!c) return res.status(404).json({ error: 'المحادثة غير موجودة' });
  const lastUser = db.prepare(`SELECT content FROM messages WHERE conversation_id=? AND role='user' ORDER BY created_at DESC LIMIT 1`).get(c.id);
  if (!lastUser) return res.status(400).json({ error: 'لا توجد رسالة لإعادة توليدها' });
  const sys = { role: 'system', content: 'أنت MODYX AI. أعد توليد الإجابة بصياغة مختلفة محسّنة ومختصرة.' };
  const result = await chatComplete({ messages: [sys, ...historyFor(c.id)], lang: req.user.lang });
  db.prepare('INSERT INTO messages(id,conversation_id,role,content,meta) VALUES(?,?,?,?,?)')
    .run(crypto.randomUUID(), c.id, 'assistant', result.text, JSON.stringify({ mode: result.mode, regenerated: true }));
  bump(req.user.id, 'messages');
  res.json({ reply: result.text, mode: result.mode });
});

/* ---------- code expert ---------- */
app.post('/api/code/:task', authRequired, chatLimiter, async (req, res) => {
  const allowed = ['code_generate', 'code_debug', 'code_explain', 'code_optimize', 'code_convert', 'code_sql', 'code_web', 'code_api', 'code_bot'];
  const task = 'code_' + (req.params.task || '').replace(/^code_/, '');
  if (!allowed.includes(task)) return res.status(400).json({ error: 'مهمة برمجية غير معروفة' });
  const { prompt, language, code } = req.body || {};
  if (!prompt && !code) return res.status(400).json({ error: 'أدخل الوصف أو الكود' });
  const sys = { role: 'system', content: `أنت AI CODE EXPERT ضمن MODYX AI. المهمة: ${task}. اللغة: ${language || 'auto'}. أجب بكود نظيف + شرح مختصر + كيفية التشغيل. لا تخترع مكتبات غير حقيقية.` };
  const result = await chatComplete({ messages: [sys, { role: 'user', content: `TASK=${task}\nLANG=${language || 'auto'}\nPROMPT=${prompt || ''}\nCODE:\n${code || ''}` }], task, lang: req.user.lang });
  bump(req.user.id, 'messages');
  res.json({ result: result.text, mode: result.mode });
});

/* ---------- website builder ---------- */
function websiteTemplate(desc) {
  const safe = String(desc).slice(0, 200).replace(/</g, '&lt;');
  const html = `<!DOCTYPE html>\n<html lang="ar" dir="rtl">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${safe}</title>\n<link rel="stylesheet" href="styles.css">\n</head>\n<body>\n<header class="hero">\n<h1>${safe}</h1>\n<p>موقع مولّد بواسطة MODYX AI — عدّله بالمحادثة ثم نزّله.</p>\n<a class="btn" href="#content">ابدأ</a>\n</header>\n<main id="content"><section class="card"><h2>من نحن</h2><p>نص تجريبي — اطلب من AI تعديل الألوان والأقسام.</p></section></main>\n<script src="app.js"><\/script>\n</body>\n</html>`;
  const css = `:root{--neon:#00cfff}*{box-sizing:border-box}body{margin:0;font-family:system-ui;background:#050b18;color:#e8f6ff}header.hero{min-height:60vh;display:grid;place-content:center;text-align:center;background:radial-gradient(600px 300px at 50% 20%,rgba(0,207,255,.25),transparent)}h1{font-size:clamp(28px,6vw,56px);text-shadow:0 0 24px rgba(0,207,255,.6)}.btn{background:var(--neon);color:#00121c;padding:12px 28px;border-radius:999px;text-decoration:none;font-weight:700}.card{margin:24px auto;max-width:720px;padding:24px;border:1px solid rgba(0,207,255,.3);border-radius:16px;background:rgba(255,255,255,.04);backdrop-filter:blur(8px)}`;
  const js = `console.log("MODYX AI site ready");\ndocument.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();document.querySelector(a.getAttribute('href'))?.scrollIntoView({behavior:'smooth'})}));`;
  return { 'index.html': html, 'styles.css': css, 'app.js': js };
}
app.post('/api/website/generate', authRequired, chatLimiter, async (req, res) => {
  const { description } = req.body || {};
  if (!description) return res.status(400).json({ error: 'اكتب وصف الموقع أولًا (مثال: اعمل لي موقع...)' });
  const sys = { role: 'system', content: 'أنت Website Generator ضمن MODYX AI. ولّد شرحًا قصيرًا لهيكل الموقع (أقسام + ألوان) بالعربية.' };
  const ai = await chatComplete({ messages: [sys, { role: 'user', content: String(description).slice(0, 2000) }], task: 'code_web', lang: req.user.lang });
  bump(req.user.id, 'messages');
  res.json({ files: websiteTemplate(description), plan: ai.text, mode: ai.mode });
});

/* ---------- files ---------- */
app.post('/api/files/upload', authRequired, (req, res) => {
  const lim = checkLimit(req.user.id, 'files');
  if (!lim.ok) return res.status(429).json({ error: `تجاوزت حد الملفات اليومي (${lim.used}/${lim.limit})` });
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'اختر ملفًا' });
    const ext = path.extname(req.file.originalname).toLowerCase();
    const kind = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext) ? 'image' : ext === '.pdf' ? 'pdf' : ['.docx', '.xlsx'].includes(ext) ? 'doc' : 'text';
    let preview = '';
    if (['.txt', '.md', '.csv', '.json'].includes(ext)) {
      try { preview = fs.readFileSync(req.file.path, 'utf8').slice(0, 6000); } catch { preview = ''; }
    }
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO files(id,user_id,conversation_id,original_name,stored_name,mime,size,kind,text_preview) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id, req.user.id, req.body?.conversation_id || '', req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, kind, preview);
    bump(req.user.id, 'files');
    res.json({ file: { id, name: req.file.originalname, size: req.file.size, kind, mime: req.file.mimetype, text_preview: preview.slice(0, 2000), url: kind === 'image' ? `/uploads/${req.file.filename}` : '' }, usage: getUsage(req.user.id) });
  });
});
app.get('/api/files', authRequired, (req, res) => {
  res.json({ files: db.prepare('SELECT id,original_name,mime,size,kind,created_at FROM files WHERE user_id=? ORDER BY created_at DESC LIMIT 50').all(req.user.id) });
});
app.delete('/api/files/:id', authRequired, (req, res) => {
  const f = db.prepare('SELECT * FROM files WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!f) return res.status(404).json({ error: 'الملف غير موجود' });
  try { fs.unlinkSync(path.join(uploadDir, f.stored_name)); } catch { /* already gone */ }
  db.prepare('DELETE FROM files WHERE id=?').run(f.id);
  res.json({ ok: true });
});

/* ---------- vision (honest: live if provider+key, else local file analysis) ---------- */
app.post('/api/vision/analyze', authRequired, chatLimiter, (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'ارفع صورة أولًا' });
    const { question } = req.body || {};
    const cap = capabilities();
    bump(req.user.id, 'images');
    if (cap.vision) {
      try {
        const b64 = fs.readFileSync(req.file.path).toString('base64');
        const liveText = await (async () => {
          const provider = cap.provider;
          if (provider === 'openai' || provider === 'openai-compatible' || provider === 'ollama') {
            const base = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
            const r = await fetch(`${base}/chat/completions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AI_API_KEY}` },
              body: JSON.stringify({ model: cap.model, messages: [{ role: 'user', content: [{ type: 'text', text: question || 'صِف هذه الصورة بالعربية' }, { type: 'image_url', image_url: { url: `data:${req.file.mimetype};base64,${b64}` } }] }], max_tokens: 1000 }),
            });
            const j = await r.json();
            return j.choices?.[0]?.message?.content || '';
          }
          return '';
        })();
        if (liveText) return res.json({ analysis: liveText, mode: 'live-vision' });
      } catch (e) { /* fall through */ }
    }
    const kb = (req.file.size / 1024).toFixed(1);
    res.json({
      mode: 'local-image-info',
      analysis: `### تحليل الصورة (وضع محلي — لا يوجد نموذج Vision متصل)\n\n- **الاسم:** ${req.file.originalname}\n- **النوع:** ${req.file.mimetype}\n- **الحجم:** ${kb} KB\n- **السؤال:** ${String(question || 'وصف الصورة').slice(0, 300)}\n\n> ${cap.visionNote}\n\n**للحصول على وصف ونصوص وعناصر حقيقية:** اضبط \`AI_PROVIDER=openai\` و \`AI_API_KEY\` لنموذج يدعم الرؤية ثم أعد الرفع. قراءة النصوص (OCR) الدقيقة تتطلب مزود Vision — لا أعرض نتائج مُختلقة.`,
    });
  });
});

/* ---------- web search ---------- */
app.get('/api/search', authRequired, async (req, res) => {
  const q = String(req.query.q || '').slice(0, 200);
  if (!q) return res.status(400).json({ error: 'اكتب كلمة البحث' });
  const lim = checkLimit(req.user.id, 'searches');
  if (!lim.ok) return res.status(429).json({ error: `تجاوزت حد البحث اليومي (${lim.used}/${lim.limit})` });
  const out = await webSearch(q);
  bump(req.user.id, 'searches');
  res.json(out);
});

/* ---------- usage & notifications ---------- */
app.get('/api/usage/me', authRequired, (req, res) => res.json(getUsage(req.user.id)));
app.get('/api/notifications', authRequired, (req, res) => {
  const rows = db.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 30').all();
  const ann = getSetting('announcement', '');
  const list = [...rows];
  if (ann) list.unshift({ id: 'ann', title: 'إعلان', body: ann, kind: 'announcement', created_at: new Date().toISOString() });
  res.json({ notifications: list });
});
app.post('/api/notifications', authRequired, adminRequired, (req, res) => {
  const { title, body, kind } = req.body || {};
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO notifications(id,title,body,kind) VALUES(?,?,?,?)').run(id, title || 'تنبيه', body || '', kind || 'info');
  adminLog(req.user.id, 'notify', title);
  res.json({ ok: true, id });
});

/* ---------- paid subscriptions (manual activation via admin; gateway-ready) ---------- */
function plansPublic() {
  const { planLimits } = require('./usage');
  return [
    { id: 'free', name: 'المجانية', price: '0', currency: getSetting('plan_currency', 'ج.م/شهريًا'), limits: planLimits('free'), features: ['محادثة ذكية', 'أدوات AI داخل الشات', 'باني مواقع', 'بحث إنترنت'] },
    { id: 'pro', name: 'الاحترافية ⭐', price: getSetting('plan_pro_price', '49'), currency: getSetting('plan_currency', 'ج.م/شهريًا'), limits: planLimits('pro'), features: ['كل مزايا المجانية', 'حدود أعلى ×10', 'أولوية السرعة', 'دعم مباشر'] },
    { id: 'developer', name: 'المطورين 💻', price: getSetting('plan_dev_price', '149'), currency: getSetting('plan_currency', 'ج.م/شهريًا'), limits: planLimits('developer'), features: ['كل مزايا الاحترافية', 'MODYX API + مفاتيح', 'Webhooks', 'حدود أعلى'] },
    { id: 'team', name: 'الفرق 👥', price: getSetting('plan_team_price', '299'), currency: getSetting('plan_currency', 'ج.م/شهريًا'), limits: planLimits('team'), features: ['كل مزايا المطورين', 'مساحة فريق مشتركة', 'أدوار وصلاحيات', 'أعلى الحدود'] },
    { id: 'vip', name: 'الـVIP 👑', price: getSetting('plan_vip_price', '99'), currency: getSetting('plan_currency', 'ج.م/شهريًا'), limits: planLimits('vip'), features: ['كل مزايا الاحترافية', 'أعلى الحدود', 'ميزات تجريبية أولًا', 'دعم VIP'] },
  ];
}
app.get('/api/plans', (req, res) => res.json({ plans: plansPublic(), payment_instructions: getSetting('payment_instructions', '') }));
app.get('/api/subscription/me', authRequired, (req, res) => {
  const pend = db.prepare("SELECT id,plan,created_at FROM subscriptions WHERE user_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1").get(req.user.id);
  res.json({ plan: req.user.plan || 'free', plan_expires: req.user.plan_expires || '', pending: pend || null });
});
app.post('/api/subscribe', authRequired, (req, res) => {
  const plan = String(req.body?.plan || '');
  if (!['pro', 'vip', 'developer', 'team'].includes(plan)) return res.status(400).json({ error: 'خطة غير معروفة' });
  if (req.user.plan === plan) return res.status(400).json({ error: 'هذه خطتك الحالية بالفعل' });
  if (db.prepare("SELECT id FROM subscriptions WHERE user_id=? AND status='pending'").get(req.user.id))
    return res.status(400).json({ error: 'لديك طلب قيد المراجعة بالفعل' });
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO subscriptions(id,user_id,plan) VALUES(?,?,?)').run(id, req.user.id, plan);
  res.json({ ok: true, id, note: 'تم استلام طلبك — سيتم التفعيل بعد تأكيد الدفع' });
});
app.get('/api/admin/subscriptions', authRequired, adminRequired, (req, res) => {
  res.json({ subs: db.prepare('SELECT s.*,u.name,u.email FROM subscriptions s JOIN users u ON u.id=s.user_id ORDER BY s.created_at DESC LIMIT 100').all() });
});
app.post('/api/admin/subscriptions/:id/approve', authRequired, adminRequired, (req, res) => {
  const s = db.prepare("SELECT * FROM subscriptions WHERE id=? AND status='pending'").get(req.params.id);
  if (!s) return res.status(404).json({ error: 'الطلب غير موجود أو تم البت فيه' });
  const exp = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  db.prepare('UPDATE users SET plan=?,plan_expires=? WHERE id=?').run(s.plan, exp, s.user_id);
  db.prepare("UPDATE subscriptions SET status='approved',decided_at=datetime('now') WHERE id=?").run(s.id);
  db.prepare('INSERT INTO notifications(id,title,body,kind) VALUES(?,?,?,?)').run(crypto.randomUUID(), 'تم تفعيل اشتراكك 💎', `خطتك الآن ${s.plan} حتى ${exp}. استمتع!`, 'sub');
  adminLog(req.user.id, 'sub_approve', `${s.user_id} -> ${s.plan}`);
  try { require('./pro').emitEvent('subscription.approved', s.user_id, { plan: s.plan, expires: exp }); } catch {}
  res.json({ ok: true, plan: s.plan, expires: exp });
});
app.post('/api/admin/subscriptions/:id/reject', authRequired, adminRequired, (req, res) => {
  db.prepare("UPDATE subscriptions SET status='rejected',decided_at=datetime('now') WHERE id=? AND status='pending'").run(req.params.id);
  adminLog(req.user.id, 'sub_reject', req.params.id);
  res.json({ ok: true });
});

/* ---------- admin ---------- */
app.get('/api/admin/stats', authRequired, adminRequired, (req, res) => {
  const users = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  const convs = db.prepare('SELECT COUNT(*) c FROM conversations').get().c;
  const msgs = db.prepare('SELECT COUNT(*) c FROM messages').get().c;
  const filesN = db.prepare('SELECT COUNT(*) c FROM files').get().c;
  const todayU = db.prepare('SELECT SUM(messages) m, SUM(files) f, SUM(searches) s FROM usage WHERE day=?').get(new Date().toISOString().slice(0, 10));
  res.json({ users, conversations: convs, messages: msgs, files: filesN, today: todayU, provider: capabilities() });
});
app.get('/api/admin/users', authRequired, adminRequired, (req, res) => {
  res.json({ users: db.prepare('SELECT id,name,email,role,blocked,created_at FROM users ORDER BY created_at DESC LIMIT 200').all() });
});
app.post('/api/admin/users/:id/block', authRequired, adminRequired, (req, res) => {
  db.prepare('UPDATE users SET blocked=1 WHERE id=?').run(req.params.id);
  adminLog(req.user.id, 'block', req.params.id);
  res.json({ ok: true });
});
app.post('/api/admin/users/:id/unblock', authRequired, adminRequired, (req, res) => {
  db.prepare('UPDATE users SET blocked=0 WHERE id=?').run(req.params.id);
  adminLog(req.user.id, 'unblock', req.params.id);
  res.json({ ok: true });
});
app.get('/api/admin/logs', authRequired, adminRequired, (req, res) => {
  res.json({ logs: db.prepare('SELECT * FROM admin_logs ORDER BY id DESC LIMIT 100').all() });
});
app.get('/api/admin/settings', authRequired, adminRequired, (req, res) => {
  const rows = db.prepare('SELECT key,value FROM app_settings').all();
  res.json({ settings: Object.fromEntries(rows.map(r => [r.key, r.value])) });
});
app.put('/api/admin/settings', authRequired, adminRequired, (req, res) => {
  for (const [k, v] of Object.entries(req.body || {})) {
    if (/^[a-z_]+$/.test(k)) setSetting(k, String(v).slice(0, 2000));
  }
  adminLog(req.user.id, 'settings_update', JSON.stringify(Object.keys(req.body || {})));
  res.json({ ok: true });
});

/* ---------- v2 pro modules (before static catch-all) ---------- */
try {
  require('./pro').mountPro(app);
  console.log('[MODYX AI] pro modules mounted');
} catch (e) { console.error('[pro] mount failed:', e.message); }

/* ---------- frontend ---------- */
app.use('/sdk', express.static(path.join(__dirname, '..', 'sdk')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'data', 'uploads'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.get('/assets/*', (req, res) => res.status(404).end()); // missing logo → clean 404 so onerror fallbacks trigger
/* public brand (white label) */
app.get('/api/brand', (req, res) => res.json({
  name: getSetting('brand_name', 'MODYX AI'),
  emoji: getSetting('brand_emoji', '⚡'),
  accent: getSetting('brand_accent', ''),
}));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'غير موجود' });
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

const HOST = process.env.HOST || '0.0.0.0';
if (!process.env.VERCEL) {
  const server = app.listen(PORT, HOST, () => console.log(`[MODYX AI] listening on http://${HOST}:${PORT} (env PORT=${process.env.PORT || 'default'})`));
  server.on('error', (e) => { console.error(`[MODYX AI] FATAL: cannot bind ${HOST}:${PORT} — ${e.message}`); process.exit(1); });
}
module.exports = app;
module.exports.processMessage = processMessage;
