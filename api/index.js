'use strict';
/* Vercel serverless entry: hands the Express app to @vercel/node.
 * Env needed on Vercel dashboard: DATABASE_URL=sqlite:/tmp/modyx.db plus your secrets.
 * Note: /tmp is ephemeral — chats persist per-instance only. For permanent
 * storage use Postgres (Neon/Supabase) + a Postgres adapter in backend/db.js.
 */
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = 'sqlite:/tmp/modyx.db';
module.exports = require('../modyx-ai/backend/server.js');
