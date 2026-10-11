import { createClient } from "@/lib/supabase/server";
import { Card, Empty, Badge } from "@/components/ui";
import { redirect } from "next/navigation";
export default async function TicketsPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await sb.from("support_tickets").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
  return <div className="space-y-4"><h1 className="text-2xl font-black">🎫 تذاكر الدعم</h1>
  {(data ?? []).length === 0 ? <Empty title="لا تذاكر" hint="أنشئ تذكرتك الأولى من صفحة الدعم" /> : (data ?? []).map((t: any) => <Card key={t.id}><div className="flex justify-between"><b>{t.subject}</b><Badge>{t.status}</Badge></div><div className="text-sm text-white/60 mt-1">{t.message}</div></Card>)}
  </div>;
}
