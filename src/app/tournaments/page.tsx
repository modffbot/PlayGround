import { createClient } from "@/lib/supabase/server";
import { Card, Badge, Empty } from "@/components/ui";
import Link from "next/link";

export default async function TournamentsPage() {
  const sb = createClient();
  const { data } = await sb.from("tournaments").select("*").order("starts_at", { ascending: true }).limit(50);
  const list = data ?? [];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">🏆 البطولات</h1>
      {list.length === 0 ? <Empty title="لا توجد بطولات حاليًا" hint="عد لاحقًا أو تابع الأخبار" /> : (
        <div className="grid gap-4 md:grid-cols-3">
          {list.map((t: any) => (
            <Link key={t.id} href={`/tournaments/${t.id}`}><Card className="card-hover">
              <div className="font-black text-lg">{t.title}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs"><Badge>{t.mode}</Badge><Badge>{t.status}</Badge><Badge>{t.registered_count}/{t.max_slots}</Badge></div>
              <div className="mt-2 text-xs text-white/50">تبدأ: {new Date(t.starts_at).toLocaleString("ar-EG")}</div>
            </Card></Link>
          ))}
        </div>
      )}
    </div>
  );
}
