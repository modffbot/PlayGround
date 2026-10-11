import { Card, Input, Label, Button } from "@/components/ui";
export default function NewTeam() {
  return <div className="mx-auto max-w-lg"><Card>
    <h1 className="text-2xl font-black">إنشاء فريق جديد 👥</h1>
    <p className="text-sm text-white/60 mt-1">أنشئ فريقك من صفحة الفرق — النموذج الكامل هناك. هذه الصفحة تأكيدية.</p>
    <a href="/teams" className="btn-neon mt-4 inline-block rounded-xl px-6 py-2.5 font-bold">الذهاب لإنشاء فريق</a>
  </Card></div>;
}
