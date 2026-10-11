import Link from "next/link";
export default function NotFound() {
  return <div className="glass rounded-3xl p-12 text-center mx-auto max-w-lg">
    <div className="text-6xl">🔥</div>
    <h1 className="mt-2 text-4xl font-black">404</h1>
    <p className="text-white/60">الصفحة غير موجودة يا بطل!</p>
    <Link href="/" className="btn-neon mt-4 inline-block rounded-xl px-6 py-2.5 font-bold">العودة للرئيسية</Link>
  </div>;
}
