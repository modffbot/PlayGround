import { createClient, createAdminClient } from "@/lib/supabase/server";
import { Card, Input, Label, Button } from "@/components/ui";
import { redirect } from "next/navigation";
import { notifyAdmin, eventMessage } from "@/lib/telegram";

async function openTicket(fd: FormData) {
  "use server";
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const subject = String(fd.get("subject") ?? "");
  const message = String(fd.get("message") ?? "");
  if (!subject || !message) return;
  const admin: any = createAdminClient();
  const { data } = await admin.from("support_tickets").insert({ user_id: user.id, subject, message }).select("id").single();
  await notifyAdmin(eventMessage("🎫 تذكرة دعم جديدة", { "الموضوع": subject, "اللاعب": user.email ?? user.id, "رقم": data?.id ?? "—" }));
  redirect("/tickets");
}

export default function SupportPage() {
  return <div className="mx-auto max-w-xl"><Card>
    <h1 className="text-2xl font-black">🛟 الدعم الفني</h1>
    <form action={openTicket} className="mt-4 grid gap-3">
      <div><Label>الموضوع</Label><Input name="subject" required placeholder="مشكلة في التسجيل..." /></div>
      <div><Label>الرسالة</Label><textarea name="message" required rows={5} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 outline-none" /></div>
      <Button>إرسال التذكرة</Button>
    </form>
  </Card></div>;
}
