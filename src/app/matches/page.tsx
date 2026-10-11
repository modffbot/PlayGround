import { createClient } from "@/lib/supabase/server";
import { Card, Badge, Empty } from "@/components/ui";
export default async function MatchesPage() {
  const sb = createClient();
  const { data } = await sb.from("matches").select("*,tournaments(title)").order("scheduled_at", { ascending: false }).limit(50);
  const list = data ?? [];
  return <div className="space-y-4"><h1 className="text-2xl font-black">⚔️ المباريات والنتائج</h1>
  {list.length === 0 ? <Empty title="لا مباريات مجدولة" hint="تابع جدول المباريات" /> : list.map((m: any) => <Card key={m.id}><div className="flex justify-between"><b>{m.tournaments?.title}</b><Badge>{m.status}</Badge></div><div className="text-xs text-white/50 mt-1">الدور: {m.stage} • {m.scheduled_at ? new Date(m.scheduled_at).toLocaleString("ar-EG") : "—"}</div></Card>)}
  </div>;
}
