import { createClient } from "@/lib/supabase/server";
import { Card, Empty } from "@/components/ui";
import { redirect } from "next/navigation";

/** Rooms: only participants + staff can see password (enforced server-side). */
export default async function RoomsPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  // Find matches the user participates in
  const parts = (await sb.from("match_participants").select("match_id").eq("user_id", user.id)).data ?? [];
  const ids = parts.map((p: any) => p.match_id);
  let rooms: any[] = [];
  if (ids.length > 0) {
    const r = await sb.from("room_details").select("*,matches(tournaments(title),scheduled_at)").in("match_id", ids);
    rooms = r.data ?? [];
  }
  return <div className="space-y-4"><h1 className="text-2xl font-black">🚪 غرف البطولات</h1>
  <p className="text-xs text-white/50">كلمات المرور ظاهرة للمشاركين المصرح لهم فقط — لا تُشاركها علنًا.</p>
  {rooms.length === 0 ? <Empty title="لا توجد غرف متاحة" hint="ستظهر الغرف هنا عند إضافتك لمباراة" /> :
    rooms.map((rm: any) => <Card key={rm.id}><div className="font-black">🏠 {rm.room_id} — {rm.matches?.tournaments?.title}</div><div className="text-sm">🗺 {rm.map ?? "—"} • 🔑 <b dir="ltr">{rm.room_password ?? "بدون كلمة مرور"}</b></div><div className="text-xs text-white/60 mt-1 whitespace-pre-wrap">{rm.instructions ?? ""}</div></Card>)}
  </div>;
}
