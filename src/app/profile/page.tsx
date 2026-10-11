import { createClient } from "@/lib/supabase/server";
import { Card, Badge } from "@/components/ui";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function ProfilePage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const p = (await sb.from("profiles").select("*").eq("id", user.id).single()).data;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card className="text-center">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-neon-blue to-neon-violet text-3xl font-black">{p?.username?.[0]?.toUpperCase() ?? "M"}</div>
        <h1 className="mt-2 text-2xl font-black">{p?.full_name}</h1>
        <div className="mt-2 flex justify-center gap-2"><Badge>@{p?.username}</Badge><Badge>{p?.role}</Badge><Badge>{p?.status}</Badge></div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-black/30 p-3"><div className="text-white/50">Free Fire UID</div><div className="font-black" dir="ltr">{p?.ff_uid ?? "—"}</div></div>
          <div className="rounded-xl bg-black/30 p-3"><div className="text-white/50">الفريق</div><div className="font-black">{p?.team_name ?? "—"}</div></div>
        </div>
        <p className="mt-2 text-xs text-white/40">⚠️ رقم الهاتف والبريد لا يظهران للعامة — فقط لك وللإدارة (وفق موافقتك).</p>
        <div className="mt-4 flex justify-center gap-2">
          <Link href="/settings" className="btn-neon rounded-xl px-5 py-2 font-bold text-sm">تعديل بياناتي</Link>
          <Link href="/players" className="rounded-xl border border-white/15 px-5 py-2 text-sm font-bold">ملفات اللاعبين</Link>
        </div>
      </Card>
    </div>
  );
}
