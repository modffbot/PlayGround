import { createClient } from "@/lib/supabase/server";
import { Card, Badge } from "@/components/ui";
import { redirect } from "next/navigation";

export default async function Dashboard() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const profile = (await sb.from("profiles").select("*").eq("id", user.id).single()).data;
  const regs = (await sb.from("tournament_registrations").select("*,tournaments(title)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10)).data ?? [];
  const notifs = (await sb.from("notifications").select("id").eq("user_id", user.id).eq("read", false)).data ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <h1 className="text-2xl font-black">أهلًا {profile?.full_name ?? "لاعب"} 👋</h1>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <Badge>@{profile?.username}</Badge>
          <Badge>UID: {profile?.ff_uid ?? "—"}</Badge>
          <Badge>إشعارات غير مقروءة: {notifs.length}</Badge>
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-4">
        {[["/tournaments", "🏆", "البطولات"], ["/teams", "👥", "فرقي"], ["/rooms", "🚪", "غرفي"], ["/notifications", "🔔", "إشعاراتي"]].map(([h, e, t]) => (
          <a key={h as string} href={h as string}><Card className="card-hover text-center"><div className="text-3xl">{e}</div><div className="mt-1 font-black">{t}</div></Card></a>
        ))}
      </div>
      <Card>
        <h2 className="font-black mb-3">📝 مشاركاتي الأخيرة</h2>
        {regs.length === 0 ? <p className="text-sm text-white/60">لم تسجّل في أي بطولة بعد. <a href="/tournaments" className="text-neon-cyan font-bold">تصفح البطولات</a></p> :
          <div className="grid gap-2">{regs.map((r: any) => <div key={r.id} className="flex justify-between rounded-xl bg-black/30 p-3 text-sm"><span>{r.tournaments?.title}</span><Badge>{r.status}</Badge></div>)}</div>}
      </Card>
    </div>
  );
}
