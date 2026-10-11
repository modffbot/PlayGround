import { createClient, createAdminClient } from "@/lib/supabase/server";
import { Card, Input, Label, Button, Empty } from "@/components/ui";
import { redirect } from "next/navigation";
import Link from "next/link";
import { notifyAdmin, eventMessage } from "@/lib/telegram";

async function createTeam(formData: FormData) {
  "use server";
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const name = String(formData.get("name") ?? "").trim();
  const tag = String(formData.get("tag") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (name.length < 3) return;
  const admin: any = createAdminClient();
  const { data, error } = await admin.from("teams").insert({ name, tag: tag || null, description: description || null, captain_id: user.id }).select("id").single();
  if (!error && data) {
    await admin.from("team_members").insert({ team_id: data.id, user_id: user.id, role: "captain" });
    await notifyAdmin(eventMessage("👥 فريق جديد", { "الفريق": name, "القائد": user.email ?? user.id }));
  }
  redirect("/teams");
}

export default async function TeamsPage() {
  const sb = createClient();
  const { data } = await sb.from("teams").select("id,name,tag,points,wins").order("points", { ascending: false }).limit(50);
  const list = data ?? [];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">👥 الفرق</h1>
        <Link href="/teams/new" className="btn-neon rounded-xl px-5 py-2 text-sm font-black">+ إنشاء فريق</Link>
      </div>
      {list.length === 0 ? <Empty title="لا توجد فرق بعد" hint="كن أول من ينشئ فريقًا" /> : (
        <div className="grid gap-4 md:grid-cols-3">
          {list.map((t: any) => <Card key={t.id} className="card-hover"><div className="font-black">{t.name}</div><div className="text-xs text-white/50">[{t.tag ?? "—"}] • {t.points} نقطة • {t.wins} فوز</div></Card>)}
        </div>
      )}
      <Card>
        <h2 className="font-black mb-2">إنشاء سريع</h2>
        <form action={createTeam} className="grid gap-2 md:grid-cols-4">
          <div><Label>اسم الفريق</Label><Input name="name" required /></div>
          <div><Label>الوسم</Label><Input name="tag" maxLength={8} /></div>
          <div><Label>الوصف</Label><Input name="description" /></div>
          <div className="flex items-end"><Button>إنشاء</Button></div>
        </form>
      </Card>
    </div>
  );
}
