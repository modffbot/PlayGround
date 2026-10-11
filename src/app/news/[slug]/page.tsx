import { createClient } from "@/lib/supabase/server";
import { Card, Empty } from "@/components/ui";
export default async function NewsDetail({ params }: { params: { slug: string } }) {
  const sb = createClient();
  const { data } = await sb.from("news_articles").select("*").eq("slug", params.slug).single();
  if (!data) return <Empty title="الخبر غير موجود" />;
  return <div className="mx-auto max-w-2xl"><Card><h1 className="text-2xl font-black">{data.title}</h1><div className="text-xs text-white/40 mt-1">{new Date(data.created_at).toLocaleString("ar-EG")}</div><div className="mt-4 whitespace-pre-wrap leading-8">{data.body}</div></Card></div>;
}
