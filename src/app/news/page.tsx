import { createClient } from "@/lib/supabase/server";
import { Card, Empty } from "@/components/ui";
import Link from "next/link";
export default async function NewsPage() {
  const sb = createClient();
  const { data } = await sb.from("news_articles").select("title,slug,excerpt,created_at").eq("published", true).order("created_at", { ascending: false }).limit(30);
  return <div className="space-y-4"><h1 className="text-2xl font-black">📰 أخبار اللعبة</h1>
  {(data ?? []).length === 0 ? <Empty title="لا أخبار بعد" /> : <div className="grid gap-4 md:grid-cols-3">{(data ?? []).map((n: any) => <Link key={n.slug} href={`/news/${n.slug}`}><Card className="card-hover"><div className="font-black">{n.title}</div><div className="text-sm text-white/60 mt-1">{n.excerpt}</div></Card></Link>)}</div>}
  </div>;
}
