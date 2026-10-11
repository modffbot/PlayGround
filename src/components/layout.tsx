import Link from "next/link";
import { Logo } from "./ui";

const links = [
  { href: "/tournaments", label: "البطولات" },
  { href: "/teams", label: "الفرق" },
  { href: "/leaderboard", label: "الترتيب" },
  { href: "/matches", label: "المباريات" },
  { href: "/news", label: "الأخبار" },
  { href: "/missions", label: "المهام" },
];

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-void/85 backdrop-blur-xl">
      <div className="container flex items-center justify-between py-3">
        <Link href="/"><Logo /></Link>
        <nav className="hidden md:flex items-center gap-5 text-sm font-bold text-white/80">
          {links.map((l) => <Link key={l.href} href={l.href} className="hover:text-neon-cyan transition">{l.label}</Link>)}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-bold hover:bg-white/10">دخول</Link>
          <Link href="/register" className="btn-neon rounded-xl px-4 py-2 text-sm font-bold">حساب جديد</Link>
        </div>
      </div>
      <nav className="md:hidden flex gap-4 overflow-x-auto px-4 pb-3 text-sm font-bold text-white/75">
        {links.map((l) => <Link key={l.href} href={l.href} className="whitespace-nowrap">{l.label}</Link>)}
        <Link href="/dashboard" className="whitespace-nowrap">لوحتي</Link>
        <Link href="/support" className="whitespace-nowrap">الدعم</Link>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 border-t border-white/10 bg-coal/60">
      <div className="container grid gap-8 py-10 md:grid-cols-4">
        <div><Logo /><p className="mt-3 text-sm text-white/60">منصة عربية احترافية لبطولات Free Fire — سجّل، نافس، واصعد للترتيب.</p></div>
        <div>
          <div className="font-black mb-3">روابط</div>
          <div className="grid gap-2 text-sm text-white/70">
            <Link href="/tournaments">البطولات</Link><Link href="/teams">الفرق</Link>
            <Link href="/leaderboard">الترتيب</Link><Link href="/schedule">الجدول</Link>
          </div>
        </div>
        <div>
          <div className="font-black mb-3">حسابك</div>
          <div className="grid gap-2 text-sm text-white/70">
            <Link href="/dashboard">لوحة المستخدم</Link><Link href="/profile">الملف الشخصي</Link>
            <Link href="/notifications">الإشعارات</Link><Link href="/settings">الإعدادات</Link>
          </div>
        </div>
        <div>
          <div className="font-black mb-3">مساعدة</div>
          <div className="grid gap-2 text-sm text-white/70">
            <Link href="/support">الدعم الفني</Link><Link href="/news">الأخبار</Link>
            <Link href="/terms">الشروط والخصوصية</Link><Link href="/admin">الإدارة</Link>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-white/40">© 2026 MODYX FREE FIRE — جميع الحقوق محفوظة</div>
    </footer>
  );
}
