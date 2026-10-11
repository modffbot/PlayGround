import { createClient } from "@/lib/supabase/server";
import { Card, Empty, Badge } from "@/components/ui";
export default async function TeamRequests() {
  const sb = createClient();
  const { data } = await sb.from("team_invitations").select("*,teams(name)").eq("status", "pending").order("created_at", { ascending: false }).limit(50);
  const list = data ?? [];
  return <div className="space-y-4"><h1 className="text-2xl font-black">📩 طلبات الانضمام</h1>
  {list.length === 0 ? <Empty title="لا توجد طلبات معلقة" /> : list.map((r: any) => <Card key={r.id}><div className="flex justify-between text-sm"><span>{r.teams?.name}</span><Badge>{r.status}</Badge></div></Card>)}
  </div>;
}
