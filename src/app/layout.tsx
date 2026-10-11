import type { Metadata } from "next";
import "./globals.css";
import { Navbar, Footer } from "@/components/layout";

export const metadata: Metadata = {
  title: "MODYX FREE FIRE — منصة البطولات",
  description: "منصة عربية احترافية لبطولات Free Fire: سجّل، كوّن فريقك، نافس واصعد للترتيب.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap'); body{font-family:'Cairo',system-ui,sans-serif}`}</style>
        <Navbar />
        <main className="container min-h-[70vh] py-6">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
