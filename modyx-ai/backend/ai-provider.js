'use strict';
/* MODYX AI - Pluggable AI Provider layer. Swap provider via env without rebuilding. */
/* env takes precedence when explicitly set; otherwise admin-panel DB value */
const AI_PROVIDER = () => (process.env.AI_PROVIDER || require('./db').getSetting('ai_provider', 'mock')).toLowerCase();
const AI_MODEL = () => process.env.AI_MODEL || require('./db').getSetting('ai_model', 'modyx-mock-1');

function capabilities() {
  const provider = AI_PROVIDER();
  const hasKey = Boolean(process.env.AI_API_KEY);
  const hasSearchKey = Boolean(process.env.TAVILY_API_KEY || process.env.SERPER_API_KEY);
  const real = hasKey && provider !== 'mock';
  return {
    provider,
    model: AI_MODEL(),
    configured: real,
    mode: real ? 'live' : 'local-smart',
    chat: true,
    code: true,
    files: true,
    // Vision only if a real vision-capable provider+key is configured; otherwise local file-info mode.
    vision: real && ['openai', 'openai-compatible', 'gemini', 'anthropic', 'ollama'].includes(provider),
    visionNote: real ? 'Vision عبر المزود المتصل.' : 'لا يوجد نموذج رؤية متصل — التحليل محلي لخصائص الصورة فقط.',
    webSearch: true,
    webSearchLive: hasSearchKey,
    webSearchNote: hasSearchKey ? 'بحث حي عبر مزود البحث.' : 'بحث عبر DuckDuckGo + Wikipedia (نتائج حقيقية، بدون مفتاح).',
    stt: false,
    tts: false,
    voiceNote: 'التعرف والنطق عبر متصفحك (Web Speech API) — لا يُدَّعى دعم STT/TTS سحابي غير متصل.',
  };
}

async function callLiveProvider({ messages, model }) {
  const provider = AI_PROVIDER();
  const key = process.env.AI_API_KEY || '';
  if (!key) throw new Error('NO_KEY');
  if (provider === 'openai' || provider === 'openai-compatible' || provider === 'ollama') {
    const base = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: model || AI_MODEL(), messages, temperature: 0.7, max_tokens: 2000 }),
    });
    if (!r.ok) throw new Error(`PROVIDER_${r.status}`);
    const j = await r.json();
    return j.choices?.[0]?.message?.content || '';
  }
  if (provider === 'anthropic') {
    const sys = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
    const msgs = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: model || AI_MODEL(), max_tokens: 2000, system: sys || undefined, messages: msgs }),
    });
    if (!r.ok) throw new Error(`PROVIDER_${r.status}`);
    const j = await r.json();
    return (j.content || []).map(c => c.text || '').join('\n');
  }
  if (provider === 'gemini') {
    const m = model || AI_MODEL() || 'gemini-1.5-flash';
    const contents = messages.filter(x => x.role !== 'system').map(x => ({ role: x.role === 'assistant' ? 'model' : 'user', parts: [{ text: x.content }] }));
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents }),
    });
    if (!r.ok) throw new Error(`PROVIDER_${r.status}`);
    const j = await r.json();
    return j.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n') || '';
  }
  throw new Error('UNKNOWN_PROVIDER');
}

/* ---- Smart local fallback (honest: labeled as on-device, works offline) ---- */
function esc(s) { return String(s).slice(0, 4000); }

function localSmartReply({ messages, task, lang }) {
  const last = (messages.filter(m => m.role === 'user').pop() || {}).content || '';
  const t = last.toLowerCase();
  const isAr = (lang || 'ar').startsWith('ar');

  // Code tasks
  if (task && task.startsWith('code')) return localCode(task, last, isAr);
  if (/اكتب.*كود|code|دالة|function|python|javascript|sql|html|api|بوت|موقع/.test(t) && t.length < 300) {
    return codeTemplate(last, isAr);
  }
  // Translate
  if (/ترجم|translate/.test(t)) {
    return isAr
      ? `وضع الترجمة الذكية (محلي):\n\nالنص الأصلي:\n${esc(last)}\n\n- للإنجليزية (ترجمة آلية مبسطة): يُنصح بربط AI_API_KEY للحصول على ترجمة عصبية كاملة. النص أعلاه جاهز للنسخ.\n- حدد اللغة الهدف وسأعيد الصياغة بأسلوب احترافي فور توفر المزود.`
      : `Smart translate (local): paste target language + text. Connect AI_API_KEY for neural MT.`;
  }
  // Summarize
  if (/لخص|تلخيص|summar/.test(t)) {
    const body = last.replace(/لخص|تلخيص|summarize:?/gi, '').trim() || last;
    const sentences = body.split(/[.!؟?\n]+/).map(s => s.trim()).filter(Boolean).slice(0, 4);
    return (isAr ? 'الملخص (محلي):\n' : 'Summary (local):\n') + sentences.map((s, i) => `${i + 1}. ${s}`).join('\n') + (isAr ? '\n\nلتلخيص أعمق اربط مزود AI.' : '');
  }
  // Rewrite
  if (/أعد كتابة|اعادة|rewrite|صياغة/.test(t)) {
    return (isAr ? 'إعادة صياغة مقترحة (محلي):\n\n' : 'Rewrite (local):\n\n') + esc(last) + (isAr ? '\n\n(اربط AI_API_KEY لصياغات متعددة الأساليب.)' : '');
  }
  // General Q&A — helpful structured answer, honest about local mode
  const topic = last.slice(0, 180);
  if (isAr) {
    return `### إجابة MODYX AI (وضع محلي ذكي)\n\nسؤالك: **${esc(topic)}**\n\n- **الخلاصة:** هذه إجابة تمهيدية مولّدة محليًا لتعمل بدون مفتاح API.\n- **خطوات مقترحة:**\n  1. حدّد هدفك بدقة (مثال، كود/ترجمة/تلخيص).\n  2. أرفق ملفًا أو صورة عند الحاجة من زر 📎.\n  3. لربط ذكاء أقوى: أضف \`AI_PROVIDER=openai\` و \`AI_API_KEY=...\` في ملف \`.env\` ثم أعد التشغيل.\n\n- **جرّب:** اكتب «اكتب لي كود Python يقرأ ملف CSV» أو «اشرح هذا الكود: ...» وسأولّد لك قالبًا جاهزًا مع شرح.`;
  }
  return `### MODYX AI (local smart mode)\n\nYour prompt: **${esc(topic)}**\n\nConnect AI_API_KEY for full neural answers. Try: "write Python code to read CSV".`;
}

function codeTemplate(prompt, isAr) {
  const p = esc(prompt);
  return (isAr ? `### قالب كود مولّد محليًا\n\nطلبك: **${p}**\n\n` : `### Local code template\n\nRequest: **${p}**\n\n`) +
`\`\`\`python
# MODYX AI - starter template
def main():
    """TODO: describe your task here"""
    data = input("Enter input: ")
    print(f"Result: {data}")

if __name__ == "__main__":
    main()
\`\`\`

` + (isAr
  ? `**شرح سريع:**\n- \`def main()\`: نقطة الدخول.\n- عدّل الدالة حسب طلبك ثم شغّل: \`python main.py\`.\n- انسخ الزر 📋 أو نزّله من قسم AI CODE EXPERT.\n\nاربط مزود AI حقيقي لتوليد كود مخصص كامل بدل القوالب.`
  : `**Quick explain:** edit main() then run \`python main.py\`. Connect a real provider for full custom code.`);
}

function localCode(task, prompt, isAr) {
  const p = esc(prompt).slice(0, 2000);
  const head = isAr ? `### نتيجة ${task} (محلي)\n\nالمدخل:\n\`\`\`\n${p}\n\`\`\`\n\n` : `### ${task} result (local)\n\nInput:\n\`\`\`\n${p}\n\`\`\`\n\n`;
  const bodies = {
    code_generate: '```python\n# Generated starter\ndef solve(n):\n    return [i*i for i in range(n)]\n\nprint(solve(5))\n```\n\n- عدّل الدالة `solve` حسب وصفك. اربط مزود AI لتوليد دقيق.',
    code_debug: '**تشخيص مبدئي:**\n1. انسخ رسالة الخطأ كاملة (Traceback).\n2. تحقق من: المسافات البادئة، الأقواس، أسماء المتغيرات، أنواع البيانات.\n3. أضف `print()` قبل السطر المتعطل لعرض القيم.\n4. اربط مزود AI لتحليل تلقائي للـ Stack Trace.',
    code_explain: '**شرح عام للبنية:** الكود يتكون من تعريفات + منطق تنفيذ. حدّد الدالة التي تريد شرحها سطرًا بسطر وسأفصّلها. مع مزود AI تحصل على شرح سطر-بسطر فوري.',
    code_optimize: '**نصائح تحسين:**\n- تجنّب الحلقات المتداخلة O(n²) واستخدم dict/set.\n- استخدم List Comprehension و Generators للبيانات الكبيرة.\n- قِس الأداء بـ `timeit` قبل وبعد.',
    code_convert: 'الصق الكود المصدر + اللغة الهدف (مثال: Python → JavaScript) وسأحوّل البنية الأساسية. التحويل الدقيق يتطلب مزود AI متصل.',
    code_sql: '```sql\n-- مثال: أعلى 10 عملاء إنفاقًا\nSELECT customer_id, SUM(total) AS revenue\nFROM orders\nGROUP BY customer_id\nORDER BY revenue DESC\nLIMIT 10;\n```',
  };
  return head + (bodies[task] || bodies.code_generate);
}

async function chatComplete({ messages, model, task, lang }) {
  const provider = AI_PROVIDER();
  const hasKey = Boolean(process.env.AI_API_KEY);
  if (provider !== 'mock' && hasKey) {
    try {
      const text = await callLiveProvider({ messages, model });
      if (text) return { text, mode: 'live', provider, model: model || AI_MODEL() };
    } catch (e) {
      // fall through to local with honest flag
      const text = localSmartReply({ messages, task, lang });
      return { text: text + `\n\n> ⚠️ تعذّر الاتصال بالمزود (${e.message}) — تم الرد محليًا.`, mode: 'local-fallback', provider, model: model || AI_MODEL() };
    }
  }
  return { text: localSmartReply({ messages, task, lang }), mode: 'local-smart', provider: 'mock', model: 'modyx-mock-1' };
}

const MODELS = [
  { id: 'modyx-mock-1', label: 'MODYX Smart (محلي)', vision: false },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini (يتطلب مفتاح)', vision: true, needsKey: true },
  { id: 'gpt-4o', label: 'GPT-4o (يتطلب مفتاح)', vision: true, needsKey: true },
  { id: 'gemini-1.5-flash', label: 'Gemini Flash (يتطلب مفتاح)', vision: true, needsKey: true },
  { id: 'claude-3-5-sonnet', label: 'Claude Sonnet (يتطلب مفتاح)', vision: true, needsKey: true },
];

module.exports = { chatComplete, capabilities, MODELS, AI_PROVIDER, AI_MODEL };
