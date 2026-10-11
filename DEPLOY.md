# MODYX FREE FIRE — Esports Platform

## 1) Supabase setup
1. Create project at supabase.com → copy URL + publishable (anon) key + service_role key.
2. SQL Editor → run `supabase/migrations/0001_modyx_schema.sql` then `0002_seed.sql`.
3. Authentication → enable Email provider, set Site URL to your Vercel URL.
4. Storage → create bucket `avatars` (public) for profile pictures.
5. To make yourself admin: `update profiles set role='admin' where username='YOUR_USERNAME';`

## 2) Telegram setup (server-only secrets)
1. Chat with @BotFather → /newbot → copy token → `TELEGRAM_BOT_TOKEN`.
2. Chat with @userinfobot (or send message to your bot then open `https://api.telegram.org/bot<TOKEN>/getUpdates`) to get your numeric chat id → `TELEGRAM_ADMIN_CHAT_ID`.
3. Optional webhook for admin commands:
   - Generate random `TELEGRAM_WEBHOOK_SECRET`.
   - After deploy: `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://YOUR_DOMAIN/api/telegram/webhook/<SECRET>`
4. Never put the token in client code or git. Test with `/help` then `/stats` from your admin chat only.

## 3) Vercel deploy
1. Push to GitHub → Import in Vercel → Framework: Next.js.
2. Environment Variables (all in Vercel → Settings → Environment Variables):
   - `NEXT_PUBLIC_SUPABASE_URL` (public)
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (public)
   - `SUPABASE_SERVICE_ROLE_KEY` (secret, server only)
   - `TELEGRAM_BOT_TOKEN` (secret)
   - `TELEGRAM_ADMIN_CHAT_ID` (secret)
   - `TELEGRAM_WEBHOOK_SECRET` (secret)
   - `NEXT_PUBLIC_SITE_URL` (public, your domain)
3. Deploy. See `.env.example` for the full list.

## 4) Local dev
```bash
npm install
cp .env.example .env.local  # fill real values (never commit)
npm run dev
```

## Security notes
- `SUPABASE_SERVICE_ROLE_KEY` imported only in `src/lib/supabase/server.ts` (server actions/routes). Never in client components.
- Room passwords queried only for participants (server check in `/rooms`).
- Profiles RLS: public sees username/ff_uid/team only via select of those columns; phone/email never selected in public pages.
- Tournament registration is atomic via `register_for_tournament()` RPC (row lock, no double-booking, no over-capacity).
- Results count only after `status='approved'` by staff.
