import { Card } from "@/components/ui";
import Link from "next/link";
export default function ConfirmEmail() {
  return <div className="mx-auto max-w-md"><Card className="text-center">
    <div className="text-5xl">📧</div>
    <h1 className="mt-2 text-2xl font-black">تحقق من بريدك</h1>
    <p className="mt-2 text-sm text-white/60">أرسلنا رابط التأكيد إلى بريدك. افتح الرابط ثم سجّل الدخول. تحقق من مجلد الرسائل غير المرغوب فيها.</p>
    <Link href="/login" className="btn-neon mt-4 inline-block rounded-xl px-6 py-2.5 font-bold">الذهاب للدخول</Link>
  </Card></div>;
}
