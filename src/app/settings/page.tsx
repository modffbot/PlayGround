"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, Input, Label, Button } from "@/components/ui";
import { logoutAction } from "@/app/actions";

export default function SettingsPage() {
  const [p, setP] = useState<any>({});
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { location.href = "/login"; return; }
      const { data } = await sb.from("profiles").select("*").eq("id", user.id).single();
      setP(data ?? {});
    })();
  }, []);
  return <div className="mx-auto max-w-xl space-y-4"><Card>
    <h1 className="text-2xl font-black">⚙️ الإعدادات</h1>
    {msg && <div className="mt-2 rounded-xl bg-neon-blue/15 border border-neon-cyan/30 p-3 text-sm">{msg}</div>}
    <form className="mt-3 grid gap-3" onSubmit={async (e) => {
      e.preventDefault();
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { error } = await sb.from("profiles").update({
        full_name: p.full_name, ff_uid: p.ff_uid || null, phone: p.phone || null,
        team_name: p.team_name || null, share_phone_with_admin: !!p.share_phone_with_admin,
      }).eq("id", user.id);
      setMsg(error ? "خطأ: " + error.message : "تم الحفظ ✅");
    }}>
      <div><Label>الاسم الكامل</Label><Input value={p.full_name ?? ""} onChange={(e) => setP({ ...p, full_name: e.target.value })} /></div>
      <div className="grid md:grid-cols-2 gap-3">
        <div><Label>UID</Label><Input value={p.ff_uid ?? ""} dir="ltr" onChange={(e) => setP({ ...p, ff_uid: e.target.value })} /></div>
        <div><Label>الهاتف</Label><Input value={p.phone ?? ""} dir="ltr" onChange={(e) => setP({ ...p, phone: e.target.value })} /></div>
      </div>
      <div><Label>الفريق</Label><Input value={p.team_name ?? ""} onChange={(e) => setP({ ...p, team_name: e.target.value })} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!p.share_phone_with_admin} onChange={(e) => setP({ ...p, share_phone_with_admin: e.target.checked })} /> مشاركة الهاتف مع الإدارة</label>
      <Button>حفظ التعديلات</Button>
    </form>
  </Card>
  <Card>
    <h2 className="font-black mb-2">🔑 تغيير كلمة المرور</h2>
    <form className="grid gap-2" onSubmit={async (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget as HTMLFormElement);
      const sb = createClient();
      const { error } = await sb.auth.updateUser({ password: String(fd.get("pw")) });
      setMsg(error ? "خطأ: " + error.message : "تم تغيير كلمة المرور ✅");
    }}>
      <Input name="pw" type="password" required minLength={8} placeholder="كلمة مرور جديدة (8+)" dir="ltr" />
      <Button>تغيير كلمة المرور</Button>
    </form>
    <form action={logoutAction} className="mt-3"><Button className="w-full bg-red-600" style={{ background: "#dc2626" }}>تسجيل الخروج</Button></form>
  </Card></div>;
}
