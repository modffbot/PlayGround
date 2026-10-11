import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { isAdminChat, notifyAdmin } from "@/lib/telegram";

/** Optional Telegram bot commands. Configure webhook to /api/telegram/webhook/[secret]. */
export async function POST(req: NextRequest, { params }: { params: { secret: string } }) {
  if (params.secret !== (process.env.TELEGRAM_WEBHOOK_SECRET ?? "")) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = await req.json().catch(() => ({}));
  const msg = update?.message;
  const chatId = msg?.chat?.id;
  const text: string = msg?.text ?? "";
  if (!chatId || !text.startsWith("/")) return NextResponse.json({ ok: true });

  const TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
  const send = async (t: string) =>
    fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: t }),
    });

  if (text.startsWith("/start")) {
    await send("🎮 MODYX FREE FIRE Bot\nأرسل /help لعرض الأوامر.");
    return NextResponse.json({ ok: true });
  }
  if (text.startsWith("/help")) {
    await send("/start /stats /users /tournaments /notifications /help — الأوامر الإدارية تتطلب Chat ID مخولًا.");
    return NextResponse.json({ ok: true });
  }
  if (!isAdminChat(chatId)) {
    await send("🚫 غير مصرح: هذا البوت للإدارة فقط.");
    return NextResponse.json({ ok: true });
  }
  try {
    const admin: any = createAdminClient();
    if (text.startsWith("/stats") || text.startsWith("/users")) {
      const [u, t, tm] = await Promise.all([
        admin.from("profiles").select("id", { count: "exact", head: true }),
        admin.from("tournaments").select("id", { count: "exact", head: true }),
        admin.from("teams").select("id", { count: "exact", head: true }),
      ]);
      await send(`📊 الإحصائيات\nاللاعبون: ${u.count}\nالفرق: ${tm.count}\nالبطولات: ${t.count}`);
    } else if (text.startsWith("/tournaments")) {
      const { data } = await admin.from("tournaments").select("title,status,registered_count,max_slots").order("starts_at", { ascending: false }).limit(10);
      await send("🏆 البطولات:\n" + (data ?? []).map((x: any) => `• ${x.title} [${x.status}] ${x.registered_count}/${x.max_slots}`).join("\n"));
    } else if (text.startsWith("/notifications")) {
      await send(`الإشعارات: ${process.env.TELEGRAM_BOT_TOKEN ? "مفعّلة ✅" : "غير مفعّلة ❌"}\nADMIN_CHAT: ${process.env.TELEGRAM_ADMIN_CHAT_ID ? "مضبوط ✅" : "ناقص ❌"}`);
    } else {
      await send("أمر غير معروف. أرسل /help");
    }
  } catch (e: any) {
    await send("خطأ: " + String(e?.message).slice(0, 200));
  }
  return NextResponse.json({ ok: true });
}
