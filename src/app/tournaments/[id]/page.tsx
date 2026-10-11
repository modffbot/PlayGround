import { createClient } from "@/lib/supabase/server";
import { Card, Badge, Empty } from "@/components/ui";
import { registerTournamentAction } from "@/app/actions";
import Link from "next/link";

export default async function TournamentDetail({ params }: { params: { id: string } }) {
  const sb = createClient();
  const t = (await sb.from("tournaments").select("*").eq("id", params.id).single()).data;
  if (!t) return <Empty title="البطولة غير موجودة" />;
  const regs = (await sb.from("tournament_registrations").select("id,user_id,status,profiles(username)").eq("tournament_id", params.id).limit(50)).data ?? [];
  const { data: { user } } = await sb.auth.getUser();
  const mine = regs.find((r: any) => r.user_id === user?.id);

  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-2xl font-black">{t.title}</h1>
        <div className="mt-2 flex flex-wrap gap-2"><Badge>{t.mode}</Badge><Badge>{t.status}</Badge><Badge>{t.registered_count}/{t.max_slots}</Badge><Badge>{t.registration_open ? "التسجيل مفتوح" : "مغلق"}</Badge></div>
        <div className="mt-3 text-sm text-white/70">🗓 {new Date(t.starts_at).toLocaleString("ar-EG")}</div>
        {t.prize && <div className="mt-1 text-sm">🎁 الجائزة: {t.prize}</div>}
        {t.rules && <div className="mt-3 rounded-xl bg-black/30 p-3 text-sm whitespace-pre-wrap">{t.rules}</div>}
        <div className="mt-4 flex gap-2">
          {mine ? <Badge>✅ أنت مسجّل ({mine.status})</Badge> : (
            <form action={async () => { "use server"; await registerTournamentAction(params.id); }}>
              <button className="btn-neon rounded-xl px-6 py-2.5 font-black" disabled={!t.registration_open}>سجّل في البطولة</button>
            </form>
          )}
          <Link href="/schedule" className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-bold">جدول المباريات</Link>
        </div>
        <p className="mt-2 text-xs text-white/40">التسجيل ذري على الخادم: يمنع التكرار وتجاوز السعة تلقائيًا.</p>
      </Card>
      <Card>
        <h2 className="font-black mb-2">👥 المشاركون ({regs.length})</h2>
        <div className="grid gap-2">{regs.map((r: any) => <div key={r.id} className="flex justify-between text-sm rounded-xl bg-black/30 p-2"><span>@{r.profiles?.username ?? "لاعب"}</span><Badge>{r.status}</Badge></div>)}</div>
      </Card>
    </div>
  );
}
