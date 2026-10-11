import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { redirect } from "next/navigation";
export default async function MissionsPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  const ach = (await sb.from("achievements").select("*")).data ?? [];
  let mine: string[] = [];
  if (user) mine = ((await sb.from("user_achievements").select("achievement_id").eq("user_id", user.id)).data ?? []).map((x: any) => x.achievement_id);
  return <div className="space-y-4"><h1 className="text-2xl font-black">🎯 المهام والإنجازات</h1>
  <div className="grid gap-3 md:grid-cols-2">{ach.map((a: any) => <Card key={a.id} className={mine.includes(a.id) ? "border-neon-cyan/50" : ""}><div className="font-black">{mine.includes(a.id) ? "✅ " : "🔒 "}{a.title} <span className="neon-text">+{a.points}</span></div><div className="text-sm text-white/60">{a.description}</div></Card>)}</div></div>;
}
