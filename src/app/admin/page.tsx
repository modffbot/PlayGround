import { createClient, createAdminClient } from "@/lib/supabase/server";
import { Card, Badge, Input, Label, Button } from "@/components/ui";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

async function isStaff(): Promise<boolean> {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return false;
  const admin: any = createAdminClient();
  const { data } = await admin.from("profiles").select("role").eq("id", user.id).single();
  return ["admin", "moderator", "referee"].includes(data?.role);
}

async function createTournament(fd: FormData) {
  "use server";
  if (!(await isStaff())) return;
  const admin: any = createAdminClient();
  await admin.from("tournaments").insert({
    title: String(fd.get("title")), mode: String(fd.get("mode")),
    max_slots: Number(fd.get("max_slots")), starts_at: String(fd.get("starts_at")),
    rules: String(fd.get("rules") ?? ""), prize: String(fd.get("prize") ?? ""),
  });
  revalidatePath("/admin");
}

export default async function AdminPage({ searchParams }: { searchParams: { q?: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  if (!(await isStaff())) return <Card className="text-center">🚫 هذه الصفحة للإدارة فقط.</Card>;

  const admin: any = createAdminClient();
  const q = searchParams.q ?? "";
  const [users, teams, tours, tickets, outbox] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin.from("teams").select("id", { count: "exact", head: true }),
    admin.from("tournaments").select("*").order("starts_at", { ascending: false }).limit(20),
    admin.from("support_tickets").select("id,subject,status").eq("status", "open").limit(10),
    admin.from("notification_outbox").select("kind,status,created_at").order("created_at", { ascending: false }).limit(10),
  ]);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayCount = (await admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", today.toISOString())).count ?? 0;
  let search: any[] = [];
  if (q) {
    const r = await admin.from("profiles").select("username,full_name,ff_uid,role,status,created_at").or(`username.ilike.%${q}%,ff_uid.ilike.%${q}%`).limit(20);
    search = r.data ?? [];
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">🛡️ لوحة تحكم المدير</h1>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[["المستخدمون", users.count ?? 0], ["التسجيلات اليوم", todayCount], ["الفرق", teams.count ?? 0], ["البطولات", tours.data?.length ?? 0], ["تذاكر مفتوحة", tickets.data?.length ?? 0]].map(([l, v]) => (
          <Card key={l as string} className="text-center p-4"><div className="text-2xl font-black neon-text">{v as number}</div><div className="text-xs text-white/60">{l}</div></Card>
        ))}
      </div>

      <Card>
        <h2 className="font-black mb-2">🔍 البحث (اسم المستخدم أو UID)</h2>
        <form className="flex gap-2"><Input name="q" defaultValue={q} placeholder="modyx_pro أو UID" /><Button>بحث</Button></form>
        {search.map((u: any) => <div key={u.username} className="mt-2 flex flex-wrap gap-2 text-sm rounded-xl bg-black/30 p-2"><b>@{u.username}</b><span className="text-white/60">{u.full_name}</span><Badge>UID:{u.ff_uid ?? "—"}</Badge><Badge>{u.role}</Badge><Badge>{u.status}</Badge></div>)}
      </Card>

      <Card>
        <h2 className="font-black mb-2">➕ إنشاء بطولة</h2>
        <form action={createTournament} className="grid gap-2 md:grid-cols-6">
          <Input name="title" required placeholder="اسم البطولة" />
          <select name="mode" className="rounded-xl bg-black/40 border border-white/10 px-3 py-2"><option value="solo">Solo</option><option value="duo">Duo</option><option value="squad">Squad</option></select>
          <Input name="max_slots" type="number" required placeholder="السعة" />
          <Input name="starts_at" type="datetime-local" required />
          <Input name="prize" placeholder="الجائزة" />
          <Input name="rules" placeholder="القواعد" />
          <Button className="md:col-span-6">إنشاء</Button>
        </form>
      </Card>

      <Card>
        <h2 className="font-black mb-2">🏆 البطولات (إدارة)</h2>
        {(tours.data ?? []).map((t: any) => <div key={t.id} className="flex justify-between text-sm p-2 rounded-xl odd:bg-black/30"><span>{t.title} — {t.registered_count}/{t.max_slots}</span><Badge>{t.status}</Badge></div>)}
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card><h2 className="font-black mb-2">🎫 الدعم المفتوح</h2>{(tickets.data ?? []).map((t: any) => <div key={t.id} className="text-sm p-2 rounded-xl odd:bg-black/30">{t.subject} <Badge>{t.status}</Badge></div>)}</Card>
        <Card><h2 className="font-black mb-2">📡 سجل إشعارات Telegram</h2>{(outbox.data ?? []).map((o: any, i: number) => <div key={i} className="text-sm p-2 rounded-xl odd:bg-black/30 flex justify-between"><span>{o.kind}</span><Badge>{o.status}</Badge></div>)}</Card>
      </div>
      <p className="text-xs text-white/40">⚠️ تغيير الأدوار (user/referee/moderator/admin) يتم عبر SQL مباشرة من مالك المشروع فقط — لا يمكن للمستخدم تغيير دوره من أي نموذج.</p>
    </div>
  );
}
