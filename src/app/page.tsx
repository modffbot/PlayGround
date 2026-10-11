import Link from "next/link";
import { Card, Badge } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  let tournaments: any[] = [];
  let stats = { players: 0, teams: 0, tournaments: 0 };
  try {
    const sb = createClient();
    const t = await sb.from("tournaments").select("id,title,mode,status,starts_at,max_slots,registered_count").eq("status", "upcoming").order("starts_at").limit(6);
    tournaments = t.data ?? [];
    const admin = (await import("@/lib/supabase/server")).createAdminClient() as any;
    const [a, b, c] = await Promise.all([
      admin.from("profiles").select("id", { count: "exact", head: true }),
      admin.from("teams").select("id", { count: "exact", head: true }),
      admin.from("tournaments").select("id", { count: "exact", head: true }),
    ]);
    stats = { players: a.count ?? 0, teams: b.count ?? 0, tournaments: c.count ?? 0 };
  } catch { /* DB not configured yet — show landing anyway */ }

  return (
    <div className="space-y-10">
      <section className="glass rounded-3xl p-8 md:p-12 text-center relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(600px 200px at 50% 0%, rgba(34,230,255,.15), transparent)" }} />
        <Badge>🔥 الموسم الجديد انطلق</Badge>
        <h1 className="mt-4 text-4xl md:text-6xl font-black">MODYX <span className="neon-text">FREE FIRE</span></h1>
        <p className="mt-3 text-white/70 max-w-xl mx-auto">منصة البطولات العربية: سجّل حسابك، كوّن فريقك، احجز مقعدك في البطولة، وتابع الغرف والنتائج والترتيب لحظة بلحظة.</p>
        <div className="mt-6 flex justify-center gap-3 flex-wrap">
          <Link href="/register" className="btn-neon rounded-xl px-6 py-3 font-black">ابدأ الآن — سجّل مجانًا</Link>
          <Link href="/tournaments" className="rounded-xl border border-white/15 bg-white/5 px-6 py-3 font-black hover:bg-white/10">تصفح البطولات</Link>
        </div>
        <div className="mt-8 grid grid-cols-3 gap-3 max-w-lg mx-auto">
          {[["لاعب", stats.players], ["فريق", stats.teams], ["بطولة", stats.tournaments]].map(([l, v]) => (
            <Card key={l as string} className="p-4"><div className="text-2xl font-black neon-text">{String(v)}</div><div className="text-xs text-white/60">{l}</div></Card>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-black">🏆 بطولات قادمة</h2>
          <Link href="/tournaments" className="text-sm text-neon-cyan font-bold">عرض الكل ←</Link>
        </div>
        {tournaments.length === 0 ? (
          <Card className="text-center text-white/60">لا توجد بطولات قادمة حاليًا — تابع الأخبار أو أنشئ حسابك لتكون أول المشاركين.</Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {tournaments.map((t) => (
              <Link key={t.id} href={`/tournaments/${t.id}`}><Card className="card-hover">
                <div className="font-black">{t.title}</div>
                <div className="mt-2 flex gap-2 text-xs"><Badge>{t.mode}</Badge><Badge>{t.registered_count}/{t.max_slots}</Badge></div>
              </Card></Link>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[["⚔️", "بطولات Solo / Duo / Squad", "سعة محددة، منع التسجيل المكرر، قائمة انتظار تلقائية."], ["👥", "فرق ودعوات", "أنشئ فريقك، ادعُ أعضاءك، واقبل طلبات الانضمام."], ["📢", "غرف ونتائج معتمدة", "الغرف للمشاركين فقط، والنتائج لا تُعتمد إلا من مشرف."]].map(([e, t, d]) => (
          <Card key={t as string}><div className="text-3xl">{e}</div><div className="mt-2 font-black">{t}</div><div className="text-sm text-white/60">{d}</div></Card>
        ))}
      </section>
    </div>
  );
}
