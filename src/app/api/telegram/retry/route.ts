import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { notifyAdmin } from "@/lib/telegram";

/** POST /api/telegram/retry — re-send failed outbox notifications (admin only via secret header). */
export async function POST(req: Request) {
  if (req.headers.get("x-cron-secret") !== (process.env.TELEGRAM_WEBHOOK_SECRET ?? "") && process.env.TELEGRAM_WEBHOOK_SECRET) {
    // allow local dev without secret
    if (process.env.NODE_ENV === "production") return NextResponse.json({ ok: false }, { status: 401 });
  }
  const admin: any = createAdminClient();
  const { data } = await admin.from("notification_outbox").select("*").eq("status", "failed").lt("attempts", 5).limit(10);
  let retried = 0;
  for (const row of data ?? []) {
    const r = await notifyAdmin(`(إعادة محاولة) ${row.kind}\n${JSON.stringify(row.payload ?? {}).slice(0, 500)}`);
    await admin.from("notification_outbox").update({
      status: r.ok ? "sent" : "failed", attempts: (row.attempts ?? 0) + 1,
      last_error: (r as any).error ?? null,
    }).eq("id", row.id);
    retried++;
  }
  return NextResponse.json({ ok: true, retried });
}
