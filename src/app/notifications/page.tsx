import { createClient } from "@/lib/supabase/server";
import { Card, Empty } from "@/components/ui";
import { redirect } from "next/navigation";
export default async function NotificationsPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await sb.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
  return <div className="space-y-4"><h1 className="text-2xl font-black">🔔 الإشعارات</h1>
  {(data ?? []).length === 0 ? <Empty title="لا إشعارات" hint="ستصلك هنا نتائج البطولات والأخبار" /> : (data ?? []).map((n: any) => <Card key={n.id}><div className="font-black">{n.title}</div><div className="text-sm text-white/60">{n.body}</div></Card>)}
  </div>;
}
