"use client";
import { useState } from "react";
import { loginAction } from "@/app/actions";
import { Card, Input, Label, Button } from "@/components/ui";
import Link from "next/link";

export default function LoginPage() {
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <h1 className="text-2xl font-black">تسجيل الدخول 🔑</h1>
        {err && <div className="mt-3 rounded-xl bg-red-500/15 border border-red-500/40 p-3 text-sm text-red-200">{err}</div>}
        <form className="mt-4 grid gap-3" action={async (fd) => { const r = await loginAction(fd); if (r?.error) setErr(r.error); }}>
          <div><Label>البريد الإلكتروني</Label><Input name="email" type="email" required dir="ltr" /></div>
          <div><Label>كلمة المرور</Label><Input name="password" type="password" required dir="ltr" /></div>
          <Button>دخول</Button>
        </form>
        <div className="mt-3 flex justify-between text-sm">
          <Link href="/forgot-password" className="text-neon-cyan">نسيت كلمة المرور؟</Link>
          <Link href="/register" className="text-white/60">حساب جديد</Link>
        </div>
      </Card>
    </div>
  );
}
