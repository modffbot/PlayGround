# MODYX AI — AI Platform

منصة AI عربية احترافية (Dark + Neon Blue + Glassmorphism) — Frontend + Backend + SQLite + AI Provider قابل للتبديل.

**المطور:** 𝑫𝒆𝒗: 𝑯𝒂𝒎𝒆𝒅 𝒂𝒍𝒔𝒉𝒉𝒂𝒕 𝑯𝒂𝒎𝒆𝒅
**تواصل:** [Telegram @MODYXBOT1](https://t.me/MODYXBOT1) · [TikTok @king_burd](https://www.tiktok.com/@king_burd)

## التشغيل

```bash
cd modyx-ai
cp .env.example .env   # ثم عدّل AUTH_SECRET و ADMIN_* و AI_*‎
npm install
npm start
# افتح http://localhost:3000
```

حساب المدير يُزرع تلقائيًا من `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## البنية

```
modyx-ai/
  backend/  server.js (API) · db.js (SQLite) · auth.js (JWT+bcrypt)
            ai-provider.js (mock/openai/anthropic/gemini/ollama) · search.js · usage.js
  frontend/ index.html · styles.css · app.js   (بدون build — يُقدَّم من Backend)
  data/     modyx.db + uploads/
```

- الاتصال بالـAI **من Backend فقط** — لا أسرار في Frontend.
- بدون `AI_API_KEY` يعمل **وضع محلي ذكي معلن** (لا ادعاء قدرات غير متصلة: Vision/Search/STT-TTs السحابية تظهر كغير متاحة بصدق).
- بحث حقيقي: Tavily إن وُجد مفتاح، وإلا DuckDuckGo + Wikipedia (لا روابط مخترعة).
- أمان: Helmet · CORS · Rate Limit · حدود استخدام يومية قابلة للتحرير من Admin · تحقق من الملفات (TXT/PDF/DOCX/XLSX/CSV/صور) · كلمات مرور bcrypt · JWT httpOnly.

## Environment

```
AI_API_KEY=        # اتركه فارغًا للوضع المحلي
AI_PROVIDER=mock   # mock | openai | openai-compatible | anthropic | gemini | ollama
AI_MODEL=
AI_BASE_URL=
DATABASE_URL=sqlite:./data/modyx.db
AUTH_SECRET=
TAVILY_API_KEY=    # اختياري للبحث الحي
```

## النشر على Vercel (مجاني)

1. ارفع المستودع على GitHub ثم Import في `vercel.com` (الملف `vercel.json` جاهز).
2. في لوحة المشروع ← Settings ← Environment Variables أضف:
   `DATABASE_URL=sqlite:/tmp/modyx.db` + مفاتيحك (`AI_API_KEY` `AUTH_SECRET` ...).
3. Deploy — ستحصل على `https://xxx.vercel.app`.

حدود معلنة على Vercel: قاعدة البيانات في `/tmp` **مؤقتة** (تُمسح مع إعادة التشغيل) —
للبيانات الدائمة اربط Postgres (Neon/Supabase) مع محول في `backend/db.js`.
المهام المجدولة تعمل عبر Cron المدمج (`/api/cron` كل ساعة).
