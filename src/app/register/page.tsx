"use client";
import { useState } from "react";
import { signupAction } from "@/app/actions";
import { Card, Input, Label, Button } from "@/components/ui";
import Link from "next/link";

export default function RegisterPage() {
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <h1 className="text-2xl font-black">إنشاء حساب جديد 🎮</h1>
        <p className="text-sm text-white/60 mt-1">الحقول بعلامة * إلزامية. رقم الهاتف و UID واسم الفريق اختيارية.</p>
        {err && <div className="mt-3 rounded-xl bg-red-500/15 border border-red-500/40 p-3 text-sm text-red-200">{err}</div>}
        <form className="mt-4 grid gap-3" action={async (fd) => { setLoading(true); setErr(null); const r = await signupAction(fd); if (r?.error) setErr(r.error); setLoading(false); }}>
          <div><Label>الاسم الكامل *</Label><Input name="full_name" required placeholder="مثال: أحمد محمد" /></div>
          <div><Label>اسم المستخدم (إنجليزي فريد) *</Label><Input name="username" required placeholder="modyx_pro" dir="ltr" /></div>
          <div><Label>البريد الإلكتروني *</Label><Input name="email" type="email" required placeholder="you@mail.com" dir="ltr" /></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>كلمة المرور * (8+ أحرف)</Label><Input name="password" type="password" required dir="ltr" /></div>
            <div><Label>تأكيد كلمة المرور *</Label><Input name="confirmPassword" type="password" required dir="ltr" /></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Free Fire UID (اختياري)</Label><Input name="ff_uid" placeholder="5123456789" dir="ltr" /></div>
            <div><Label>رقم الهاتف (اختياري)</Label><Input name="phone" placeholder="+20..." dir="ltr" /></div>
          </div>
          <div><Label>اسم الفريق (اختياري)</Label><Input name="team_name" placeholder="MODYX Legends" /></div>
          <label className="flex items-center gap-2 text-sm text-white/75"><input type="checkbox" name="share_phone_with_admin" className="h-4 w-4" /> أوافق على مشاركة رقم التواصل مع الإدارة عند الحاجة</label>
          <label className="flex items-center gap-2 text-sm text-white/75"><input type="checkbox" name="terms" required className="h-4 w-4" /> أوافق على <Link href="/terms" className="text-neon-cyan underline">الشروط وسياسة الخصوصية</Link> *</label>
          <Button disabled={loading}>{loading ? "جارٍ إنشاء الحساب..." : "إنشاء الحساب"}</Button>
        </form>
        <p className="mt-3 text-sm text-white/60">لديك حساب؟ <Link href="/login" className="text-neon-cyan font-bold">سجّل الدخول</Link></p>
      </Card>
    </div>
  );
}
