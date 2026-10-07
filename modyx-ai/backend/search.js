'use strict';
/* MODYX AI - Honest web search: Tavily/Serper if key, else DuckDuckGo + Wikipedia (real results, no fabrication) */
async function ddgSearch(q) {
  const out = [];
  try {
    const r = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&lang=ar`, { signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    if (j.AbstractText) out.push({ title: j.Heading || q, url: j.AbstractURL || '', snippet: j.AbstractText, source: j.AbstractSource || 'DuckDuckGo', date: '' });
    for (const t of (j.RelatedTopics || []).slice(0, 5)) {
      if (t.Text) out.push({ title: (t.Text || '').slice(0, 90), url: t.FirstURL || '', snippet: t.Text || '', source: 'DuckDuckGo', date: '' });
    }
  } catch { /* offline -> empty */ }
  try {
    const w = await fetch(`https://ar.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(8000) });
    if (w.ok) {
      const j = await w.json();
      if (j.extract) out.push({ title: j.title, url: j.content_urls?.desktop?.page || '', snippet: j.extract.slice(0, 400), source: 'Wikipedia', date: '' });
    }
  } catch { /* ignore */ }
  return out;
}

async function tavilySearch(q) {
  if (!process.env.TAVILY_API_KEY) return null;
  try {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query: q, max_results: 6, include_answer: true }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return (j.results || []).map(x => ({ title: x.title, url: x.url, snippet: x.content?.slice(0, 300) || '', source: 'Tavily', date: x.published_date || '' }));
  } catch { return null; }
}

async function webSearch(q) {
  const live = await tavilySearch(q);
  if (live && live.length) return { results: live, live: true, engine: 'tavily' };
  const ddg = await ddgSearch(q);
  return { results: ddg, live: ddg.length > 0, engine: ddg.length ? 'duckduckgo+wikipedia' : 'none' };
}

module.exports = { webSearch };
