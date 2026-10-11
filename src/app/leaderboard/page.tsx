import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
export default async function Leaderboard() {
  const sb = createClient();
  let rows: any[] = [];
  try {
    const r = await sb.from("score_history").select("points,user_id,profiles(username)").limit(200);
    const map = new Map<string, number>();
    (r.data ?? []).forEach((x: any) => map.set(x.profiles?.username ?? x.user_id, (map.get(x.profiles?.username ?? x.user_id) ?? 0) + x.points));
    rows = Array.from(map.entries()).map(([username, points]) => ({ username, points })).sort((a, b) => b.points - a.points).slice(0, 30);
  } catch {}
  const teams = (await sb.from("teams").select("name,points").order("points", { ascending: false }).limit(20)).data ?? [];
  return <div className="grid gap-4 md:grid-cols-2">
    <Card><h1 className="text-xl font-black mb-3">🏅 ترتيب اللاعبين</h1>{rows.length === 0 ? <p className="text-sm text-white/60">لا نقاط بعد — تُحتسب بعد اعتماد النتائج.</p> : rows.map((r, i) => <div key={r.username} className="flex justify-between p-2 text-sm rounded-xl odd:bg-black/30"><span>#{i + 1} @{r.username}</span><b className="neon-text">{r.points}</b></div>)}</Card>
    <Card><h2 className="text-xl font-black mb-3">👥 ترتيب الفرق</h2>{teams.length === 0 ? <p className="text-sm text-white/60">لا فرق بعد.</p> : teams.map((t: any, i: number) => <div key={t.name} className="flex justify-between p-2 text-sm rounded-xl odd:bg-black/30"><span>#{i + 1} {t.name}</span><b className="neon-text">{t.points}</b></div>)}</Card>
  </div>;
}
