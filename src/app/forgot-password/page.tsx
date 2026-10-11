"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, Input, Label, Button } from "@/components/ui";

export default function ForgotPassword() {
  const [msg, setMsg] = useState<string | null>(null);
  return <div className="mx-auto max-w-md"><Card>
    <h1 className="text-2xl font-black">استعادة كلمة المرور 🔄</h1>
    {msg && <div className="mt-3 rounded-xl bg-neon-blue/15 border border-neon-cyan/30 p-3 text-sm">{msg}</div>}
    <form className="mt-4 grid gap-3" onSubmit={async (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget as HTMLFormElement);
      const email = String(fd.get("email"));
      const sb = createClient();
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/settings` });
      setMsg(error ? "تعذّر الإرسال: " + error.message : "تم إرسال رابط الاستعادة إلى بريدك ✅");
    }}>
      <div><Label>البريد الإلكتروني</Label><Input name="email" type="email" required dir="ltr" /></div>
      <Button>إرسال رابط الاستعادة</Button>
    </form>
  </Card></div>;
}
