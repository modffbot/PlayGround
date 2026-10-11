import { createClient } from "@/lib/supabase/server";
import { Card, Badge, Empty } from "@/components/ui";
export default async function SchedulePage() {
  const sb = createClient();
  const { data } = await sb.from("matches").select("*,tournaments(title)").gte("scheduled_at", new Date(Date.now() - 86400000).toISOString()).order("scheduled_at").limit(50);
  return <div className="space-y-4"><h1 className="text-2xl font-black">🗓 جدول المباريات</h1>
  {(data ?? []).length === 0 ? <Empty title="لا مباريات قادمة" /> : (data ?? []).map((m: any) => <Card key={m.id}><div className="flex justify-between"><b>{m.tournaments?.title} — {m.stage}</b><Badge>{m.status}</Badge></div><div className="text-sm text-white/60">{m.scheduled_at ? new Date(m.scheduled_at).toLocaleString("ar-EG") : "—"}</div></Card>)}
  </div>;
}
