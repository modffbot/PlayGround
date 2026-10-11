import { createClient } from "@/lib/supabase/server";
import { Card, Badge } from "@/components/ui";
export default async function PlayersPage() {
  const sb = createClient();
  // Public-safe: never expose phone/email
  const { data } = await sb.from("profiles").select("username,full_name,ff_uid,team_name,created_at").order("created_at", { ascending: false }).limit(60);
  return <div className="space-y-4"><h1 className="text-2xl font-black">🎮 ملفات اللاعبين</h1>
  <div className="grid gap-3 md:grid-cols-3">{(data ?? []).map((p: any) => <Card key={p.username} className="card-hover"><div className="font-black">@{p.username}</div><div className="text-sm text-white/60">{p.full_name}</div><div className="mt-2 flex gap-2 text-xs"><Badge>UID: {p.ff_uid ?? "—"}</Badge><Badge>{p.team_name ?? "بدون فريق"}</Badge></div></Card>)}</div></div>;
}
