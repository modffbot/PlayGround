import { escapeHtml } from "./utils";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT = process.env.TELEGRAM_ADMIN_CHAT_ID;

export function telegramConfigured() { return Boolean(TOKEN && ADMIN_CHAT); }

async function callTelegram(method: string, payload: Record<string, unknown>) {
  if (!TOKEN) throw new Error("TELEGRAM_BOT_TOKEN missing");
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new Error(`Telegram API error: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return data;
}

/** Send HTML message to admin chat. Never throws fatally — returns status. */
export async function notifyAdmin(html: string) {
  if (!telegramConfigured()) return { ok: false as const, skipped: true, error: "not-configured" };
  try {
    await callTelegram("sendMessage", {
      chat_id: ADMIN_CHAT,
      text: html,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    return { ok: true as const, skipped: false };
  } catch (e: any) {
    console.error("[telegram] notifyAdmin failed:", e?.message);
    return { ok: false as const, skipped: false, error: String(e?.message ?? e) };
  }
}

export function newPlayerMessage(p: {
  full_name: string; username: string; ff_uid?: string | null; team_name?: string | null;
  created_at: string; email_confirmed: string; phone?: string | null; share_phone: boolean; total: number;
}) {
  const lines = [
    `<b>🎮 تسجيل لاعب جديد - MODYX FREE FIRE</b>`,
    ``,
    `الاسم: ${escapeHtml(p.full_name)}`,
    `Username: ${escapeHtml(p.username)}`,
    `Free Fire UID: ${escapeHtml(p.ff_uid || "—")}`,
    `الفريق: ${escapeHtml(p.team_name || "—")}`,
    `تاريخ التسجيل: ${escapeHtml(p.created_at)}`,
    `تأكيد البريد: ${escapeHtml(p.email_confirmed)}`,
    ``,
  ];
  if (p.share_phone && p.phone) lines.push(`رقم التواصل: ${escapeHtml(p.phone)}`);
  lines.push(``);
  lines.push(`إجمالي المسجلين: ${p.total}`);
  return lines.join("\n");
}

export function eventMessage(title: string, rows: Record<string, string | number>) {
  const lines = [`<b>${escapeHtml(title)}</b>`, ``];
  for (const [k, v] of Object.entries(rows)) lines.push(`${escapeHtml(k)}: ${escapeHtml(String(v))}`);
  return lines.join("\n");
}

export function isAdminChat(chatId: string | number) {
  const allowed = (ADMIN_CHAT ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return allowed.includes(String(chatId));
}
