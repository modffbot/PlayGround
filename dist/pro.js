/* MODYX Pro Studio — console for research/agents/tasks/workspace/AI platform (uses globals from app.js) */
window.ProUI = (() => {
  const TABS = [
    ['research', '🔬 بحث عميق'], ['agents', '🤖 وكلاء'], ['tasks', '✅ مهام'],
    ['scheduled', '⏰ مجدولة'], ['projects', '🗂️ مشاريع'], ['assistants', '🧑‍🎨 مساعدوني'],
    ['kb', '📖 المعرفة'], ['images', '🎨 صوري'], ['docs', '📄 مستندات'],
    ['sandbox', '🧪 Sandbox'], ['prompts', '📚 برومبتات'], ['compare', '⚖️ مقارنة'],
    ['github', '🐙 GitHub'], ['apikeys', '🔑 API'], ['webhooks', '🪝 Webhooks'],
    ['market', '🏪 السوق'], ['teams', '👥 فرق'], ['credits', '🪙 كريدت'],
    ['stats', '📊 إحصائياتي'], ['telegram', '✈️ Telegram'],
    ['admin', '🛡️ إدارة Pro'],
  ];
  const ADMIN_ONLY = new Set(['admin']);
  const B = (id) => document.getElementById(id);
  const row = (inner) => `<div class="prow">${inner}</div>`;
  const inp = (id, ph, v = '') => `<input id="${id}" placeholder="${ph}" value="${esc(v)}">`;
  async function readSSE(res, onEv) {
    const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '';
    for (;;) { const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n'); buf = parts.pop();
      for (const p of parts) { const l = p.trim().split('\n').find(x => x.startsWith('data:')); if (l) onEv(JSON.parse(l.slice(5))); } }
  }
  const R = {
    research: { h: '🔬 Deep Research — تحليل + مصادر متعددة + تقرير موثق', b: `
      ${row(inp('rsQ', 'سؤال البحث العميق...') + '<button class="btn primary" id="rsGo">🔬 ابدأ البحث</button>')}
      <div class="prow"><div style="flex:1;background:rgba(255,255,255,.08);border-radius:99px;height:10px"><i id="rsBar" style="display:block;height:100%;width:0;background:linear-gradient(90deg,var(--neon),var(--neon2));border-radius:99px"></i></div></div>
      <div id="rsLog"></div><div id="rsOut"></div>`,
      w() { B('rsGo').onclick = async () => {
        const q = B('rsQ').value.trim(); if (!q) return toast('اكتب السؤال');
        B('rsLog').innerHTML = ''; B('rsOut').innerHTML = '<div class="skel"></div>';
        try { const r = await fetch('/api/research', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ question: q }) });
          await readSSE(r, (ev) => {
            if (ev.step) { B('rsBar').style.width = (ev.progress || 10) + '%'; B('rsLog').innerHTML += `<div class="filechip">• <b>${esc(ev.step)}</b> ${esc(typeof ev.detail === 'string' ? ev.detail.slice(0, 120) : '')}</div>`; }
            if (ev.error) B('rsOut').innerHTML = '<div class="empty">❌ ' + esc(ev.error) + '</div>';
            if (ev.done) { B('rsBar').style.width = '100%'; B('rsOut').innerHTML = `<div class="msg ai">${md(ev.report)}</div><div class="wcard"><b>📚 المصادر (${ev.sources.length})</b>${ev.sources.map((s, i) => `<div style="font-size:13px">Source ${i + 1}: ${esc(s.title)}<br><a href="${esc(s.url)}" target="_blank" rel="noopener">🔗 ${esc((s.url || '').slice(0, 70))}</a></div>`).join('')}</div>`; }
          });
        } catch (e) { B('rsOut').innerHTML = '<div class="empty">❌ ' + esc(e.message) + '</div>'; } }; } },
    agents: { h: '🤖 Multi-Agent — بحث + تنفيذ + مراجعة مع إيقاف', b: `
      ${row(inp('agT', 'مثال: اكتب دالة ترتب قائمة مع شرح') + '<button class="btn primary" id="agGo">▶️ شغّل الوكلاء</button><button class="btn danger" id="agStop" hidden>⏹️ إيقاف</button>')}
      <div id="agLog"></div><div id="agOut"></div>`,
      w() { let job = null;
        B('agGo').onclick = async () => { const t = B('agT').value.trim(); if (!t) return toast('اكتب المهمة');
          B('agLog').innerHTML = ''; B('agOut').innerHTML = '<div class="skel"></div>'; B('agStop').hidden = false;
          try { const r = await fetch('/api/agents', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ task: t }) });
            await readSSE(r, (ev) => {
              if (ev.job) job = ev.job;
              if (ev.agent) B('agLog').innerHTML += `<div class="filechip">🤖 <b>${esc(ev.agent)}</b> — ${esc(ev.status || '')} ${esc((ev.log || ev.result || '').slice(0, 150))}</div>`;
              if (ev.stopped) B('agOut').innerHTML = '<div class="empty">⏹️ توقفت المهمة</div>';
              if (ev.error) B('agOut').innerHTML = '<div class="empty">❌ ' + esc(ev.error) + '</div>';
              if (ev.done) B('agOut').innerHTML = `<div class="msg ai">${md(ev.final)}</div><div class="msg ai"><b>مراجعة:</b><br>${md(ev.review)}</div>`;
            });
          } catch (e) { B('agOut').innerHTML = '<div class="empty">❌ ' + esc(e.message) + '</div>'; }
          B('agStop').hidden = true; };
        B('agStop').onclick = async () => { if (job) await api('/api/agents/' + job + '/stop', { method: 'POST' }); }; } },
    tasks: { h: '✅ Task Manager', b: `${row(inp('tkT', 'مهمة جديدة...') + '<select id="tkP"><option value="low">منخفضة</option><option value="normal" selected>عادية</option><option value="high">عالية</option></select><button class="btn primary" id="tkAdd">＋</button>')}<div id="tkL"></div>`,
      async w() { const load = async () => { const j = await api('/api/tasks'); B('tkL').innerHTML = j.tasks.length ? `<table class="ptable">${j.tasks.map(t => `<tr><td>${esc(t.title)}</td><td>${esc(t.priority)}</td><td>${esc(t.status)}</td><td><button data-st="completed" data-id="${t.id}">✅</button> <button data-st="paused" data-id="${t.id}">⏸️</button> <button data-del-t="${t.id}">🗑️</button></td></tr>`).join('')}</table>` : '<div class="empty">لا مهام</div>';
          B('tkL').querySelectorAll('[data-st]').forEach(x => x.onclick = async () => { await api('/api/tasks/' + x.dataset.id, { method: 'PUT', body: JSON.stringify({ status: x.dataset.st }) }); load(); });
          B('tkL').querySelectorAll('[data-del-t]').forEach(x => x.onclick = async () => { await api('/api/tasks/' + x.dataset.delT, { method: 'DELETE' }); load(); }); };
        B('tkAdd').onclick = async () => { await api('/api/tasks', { method: 'POST', body: JSON.stringify({ title: B('tkT').value, priority: B('tkP').value }) }); B('tkT').value = ''; load(); }; load(); } },
    scheduled: { h: '⏰ Scheduled Tasks — مثال: كل يوم 8 صباحًا لخص الأخبار', b: `${row('<button class="btn primary" id="scBrief">🌅 جدولة البريف الصباحي (8:00)</button><button class="btn" id="scBriefNow">☀️ بريف اليوم الآن</button>')}${row(inp('scT', 'العنوان') + inp('scP', 'أمر المهمة...') + inp('scS', ' HH:MM أو تاريخ (2026-10-08T08:00)'))}<div class="prow"><select id="scR"><option value="once">مرة واحدة</option><option value="daily">يوميًا</option></select><button class="btn primary" id="scAdd">＋ جدولة</button></div><div id="scL"></div><div id="scBr"></div>`,
      async w() { const load = async () => { const j = await api('/api/scheduled'); B('scL').innerHTML = j.tasks.length ? j.tasks.map(t => { const h = (() => { try { return JSON.parse(t.history || '[]'); } catch { return []; } })(); return `<div class="card" style="margin:6px 0;padding:10px"><b>${esc(t.title)}</b> [${esc(t.repeat)} ${esc(t.schedule)}] ${t.enabled ? '🟢' : '⚪'}<br><small>${esc(t.prompt.slice(0, 80))}</small><br><small>آخر تنفيذ: ${esc(t.last_run || '—')} · التالي: ${esc(t.next_run || '—')}</small><div class="mactions"><button data-run-s="${t.id}">▶️ نفذ الآن</button><button data-tog-s="${t.id}" data-e="${t.enabled}">⏯️</button><button data-del-s="${t.id}">🗑️</button></div>${h.length ? `<small>السجل: ${esc(h[0].result.slice(0, 120))}...</small>` : ''}</div>`; }).join('') : '<div class="empty">لا مهام مجدولة</div>';
          B('scL').querySelectorAll('[data-run-s]').forEach(x => x.onclick = async () => { toast('ينفذ...'); await api('/api/scheduled/' + x.dataset.runS + '/run', { method: 'POST' }); load(); });
          B('scL').querySelectorAll('[data-tog-s]').forEach(x => x.onclick = async () => { await api('/api/scheduled/' + x.dataset.togS, { method: 'PUT', body: JSON.stringify({ enabled: x.dataset.e === '1' ? 0 : 1 }) }); load(); });
          B('scL').querySelectorAll('[data-del-s]').forEach(x => x.onclick = async () => { await api('/api/scheduled/' + x.dataset.delS, { method: 'DELETE' }); load(); }); };
        B('scBriefNow').onclick = async () => { const city = prompt('مدينة البريف:', 'القاهرة') || 'القاهرة'; B('scBr').innerHTML = '<div class="skel"></div>'; try { const r = await api('/api/briefing', { method: 'POST', body: JSON.stringify({ city }) }); B('scBr').innerHTML = `<div class="msg ai">${md(r.briefing)}</div>`; } catch (e) { B('scBr').innerHTML = '<div class="empty">❌ ' + esc(e.message) + '</div>'; } };
        B('scBrief').onclick = async () => { const city = prompt('مدينة البريف اليومي:', 'القاهرة') || 'القاهرة'; await api('/api/scheduled', { method: 'POST', body: JSON.stringify({ title: '🌅 البريف الصباحي', prompt: 'BRIEFING:' + city, schedule: '08:00', repeat: 'daily' }) }); toast('تمت جدولة البريف اليومي 🌅'); load(); };
        B('scAdd').onclick = async () => { await api('/api/scheduled', { method: 'POST', body: JSON.stringify({ title: B('scT').value, prompt: B('scP').value, schedule: B('scS').value, repeat: B('scR').value }) }); load(); }; load(); } },
    projects: { h: '🗂️ Workspace — مشاريع + ملاحظات (Split Screen)', b: `${row(inp('pjT', 'مشروع جديد...') + '<button class="btn primary" id="pjAdd">＋</button>')}<div class="split"><div id="pjL"></div><div><label>ملاحظات المشروع</label><div id="ntL"></div>${row(inp('ntT', 'عنوان الملاحظة') + '<button class="btn" id="ntAdd">＋</button>')}<textarea id="ntB" placeholder="نص الملاحظة..." style="min-height:140px"></textarea></div></div>`,
      async w() { let cur = null;
        const load = async () => { const j = await api('/api/projects'); B('pjL').innerHTML = j.projects.length ? j.projects.map(p => `<div class="chatitem" data-pj="${p.id}"><span>${esc(p.title)}</span></div>`).join('') : '<div class="empty">لا مشاريع</div>';
          B('pjL').querySelectorAll('[data-pj]').forEach(x => x.onclick = () => { cur = x.dataset.pj; loadNotes(); }); };
        const loadNotes = async () => { if (!cur) return; const j = await api('/api/projects/' + cur + '/notes'); B('ntL').innerHTML = j.notes.map(n => `<div class="filechip" data-nt="${n.id}" data-b="${esc(n.body)}">📝 ${esc(n.title)}</div>`).join('') || '<div class="empty">لا ملاحظات</div>';
          B('ntL').querySelectorAll('[data-nt]').forEach(x => x.onclick = () => { B('ntT').value = x.textContent.trim(); B('ntB').value = x.dataset.b; B('ntB').dataset.edit = x.dataset.nt; }); };
        B('pjAdd').onclick = async () => { const j = await api('/api/projects', { method: 'POST', body: JSON.stringify({ title: B('pjT').value }) }); B('pjT').value = ''; cur = j.id; load(); };
        B('ntAdd').onclick = async () => { if (!cur) return toast('اختر مشروعًا'); const eid = B('ntB').dataset.edit;
          if (eid) { await api('/api/notes/' + eid, { method: 'PUT', body: JSON.stringify({ title: B('ntT').value, body: B('ntB').value }) }); delete B('ntB').dataset.edit; }
          else await api('/api/projects/' + cur + '/notes', { method: 'POST', body: JSON.stringify({ title: B('ntT').value, body: B('ntB').value }) });
          B('ntT').value = ''; B('ntB').value = ''; loadNotes(); };
        load(); } },
    assistants: { h: '🧑‍🎨 Custom AI — أنشئ مساعدك الخاص واستخدمه في الشات', b: `<div class="prow" id="personaRow"></div>${row(inp('caN', 'الاسم') + inp('caI', 'تعليمات...') + '<button class="btn primary" id="caAdd">＋ إنشاء</button>')}<div id="caL"></div>`,
      async w() { const load = async () => { const j = await api('/api/assistants'); B('caL').innerHTML = j.assistants.map(a => `<div class="filechip">${esc(a.avatar)} <b>${esc(a.name)}</b> <small>${esc((a.instructions || '').slice(0, 60))}</small><button data-use-a="${a.id}">💬 استخدام</button><button data-pub-a="${a.id}">🏪 نشر</button><button data-del-a="${a.id}">🗑️</button></div>`).join('') || '<div class="empty">لا مساعدين</div>';
          B('caL').querySelectorAll('[data-use-a]').forEach(x => x.onclick = async () => { const as = await api('/api/assistants'); const el = document.getElementById('assistantSel'); if (el) { el.innerHTML = '<option value="">🤖 عام</option>' + as.assistants.map(z => `<option value="${z.id}">🤖 ${esc(z.name)}</option>`).join(''); el.value = x.dataset.useA; } showTab('chat'); toast('تم اختيار المساعد ✅'); });
          B('caL').querySelectorAll('[data-pub-a]').forEach(x => x.onclick = async () => { await api('/api/market', { method: 'POST', body: JSON.stringify({ kind: 'custom_ai', ref_id: x.dataset.pubA, title: 'مساعد مخصص', body: '' }) }); toast('تم النشر في السوق 🏪'); });
          B('caL').querySelectorAll('[data-del-a]').forEach(x => x.onclick = async () => { await api('/api/assistants/' + x.dataset.delA, { method: 'DELETE' }); load(); }); };
        B('caAdd').onclick = async () => { await api('/api/assistants', { method: 'POST', body: JSON.stringify({ name: B('caN').value, instructions: B('caI').value }) }); B('caN').value = ''; B('caI').value = ''; load(); }; load();
        try { const ps = await api('/api/personas'); B('personaRow').innerHTML = '<small>شخصيات جاهزة:</small>' + ps.personas.map(p => `<button class="chip" data-pk="${p.key}">${esc(p.name)}</button>`).join('');
          B('personaRow').querySelectorAll('[data-pk]').forEach(x => x.onclick = async () => { await api('/api/assistants/preset', { method: 'POST', body: JSON.stringify({ key: x.dataset.pk }) }); toast('تم إنشاء الشخصية ✅'); load(); });
        } catch {} } },
    kb: { h: '📖 Knowledge Base — مجموعات + RAG صادق', b: `${row(inp('kbT', 'مجموعة جديدة...') + '<button class="btn primary" id="kbAdd">＋</button>')}<div id="kbL"></div><div id="kbD"></div>`,
      async w() { let cur = null;
        const load = async () => { const j = await api('/api/kb'); B('kbL').innerHTML = j.collections.map(c => `<div class="chatitem" data-kb="${c.id}"><span>📖 ${esc(c.title)}</span><button data-reidx="${c.id}" title="إعادة فهرسة">🔄</button><button data-del-kb="${c.id}">🗑️</button></div>`).join('') || '<div class="empty">لا مجموعات</div>';
          B('kbL').querySelectorAll('[data-kb]').forEach(x => x.onclick = () => { cur = x.dataset.kb; showDocs(); });
          B('kbL').querySelectorAll('[data-del-kb]').forEach(x => x.onclick = async (e) => { e.stopPropagation(); await api('/api/kb/' + x.dataset.delKb, { method: 'DELETE' }); load(); });
          B('kbL').querySelectorAll('[data-reidx]').forEach(x => { x.onclick = (e) => { e.stopPropagation(); toast('الفهرسة لحظية (بحث كلمات) — لا حاجة لإعادة بناء ✅'); }; }); };
        const showDocs = async () => { const j = await api('/api/kb/' + cur + '/docs');
          B('kbD').innerHTML = `<h4>المستندات + سؤال المجموعة</h4>${row('<textarea id="kbTxt" placeholder="الصق نص مستند..."></textarea>')}${row(inp('kbF', 'اسم الملف') + '<button class="btn" id="kbDocAdd">＋ إضافة</button>')}${j.docs.map(d => `<div class="filechip">📄 ${esc(d.filename)} <small>${esc(d.preview.slice(0, 60))}</small></div>`).join('')}${row(inp('kbQ', 'اسأل هذه المجموعة...') + '<button class="btn primary" id="kbAsk">🔍 سؤال</button>')}<div id="kbOut"></div>`;
          B('kbDocAdd').onclick = async () => { await api('/api/kb/' + cur + '/docs', { method: 'POST', body: JSON.stringify({ filename: B('kbF').value || 'doc.txt', text: B('kbTxt').value }) }); showDocs(); };
          B('kbAsk').onclick = async () => { const r = await api('/api/kb/' + cur + '/ask', { method: 'POST', body: JSON.stringify({ question: B('kbQ').value }) }); B('kbOut').innerHTML = `<div class="msg ai">${md(r.reply)}</div>` + (r.sources || []).map(s => `<div class="filechip">Source ${s.n}: ${esc(s.filename)}</div>`).join(''); }; };
        B('kbAdd').onclick = async () => { await api('/api/kb', { method: 'POST', body: JSON.stringify({ title: B('kbT').value }) }); B('kbT').value = ''; load(); }; load(); } },
    images: { h: '🎨 صوري المولدة + تنويعات', b: '<div id="imL"></div>',
      async w() { const j = await api('/api/images'); B('imL').innerHTML = j.images.map(i => `<div class="card" style="margin:6px 0"><small>${esc(i.prompt.slice(0, 80))} (${esc(i.via)})</small><br><img src="${esc(i.url)}" loading="lazy" style="width:100%;border-radius:10px;margin-top:6px"><div class="mactions"><a href="${esc(i.url)}" target="_blank"><button>⬇️ تحميل/فتح</button></a><button data-var="${i.id}">🔀 تنويع</button></div></div>`).join('') || '<div class="empty">ولّد صورًا من الشات: «ارسم صورة...»</div>';
        B('imL').querySelectorAll('[data-var]').forEach(x => x.onclick = async () => { toast('يولّد التنويع...'); const r = await api('/api/images/variation', { method: 'POST', body: JSON.stringify({ id: x.dataset.var }) }); window.open(r.url, '_blank'); }); } },
    docs: { h: '📄 AI Document Studio — قل: أنشئ تقريرًا عن...', b: `${row(inp('dcT', 'عنوان المستند') + '<select id="dcF"><option value="md">Markdown</option><option value="txt">TXT</option><option value="csv">CSV</option><option value="html">HTML</option></select>')}${row(inp('dcQ', 'الموضوع...') + '<button class="btn primary" id="dcGo">✨ إنشاء</button>')}<div id="dcOut"></div><h4>⚖️ مقارنة مستندين</h4>${row('<textarea id="cmpA" placeholder="النص الأول..."></textarea>')}${row('<textarea id="cmpB" placeholder="النص الثاني..."></textarea>')}<div class="prow"><button class="btn primary" id="cmpGo">⚖️ قارن</button></div><div id="cmpOut"></div>`,
      w() { B('dcGo').onclick = async () => { B('dcOut').innerHTML = '<div class="skel"></div>';
          try { const r = await api('/api/docs', { method: 'POST', body: JSON.stringify({ title: B('dcT').value, topic: B('dcQ').value, format: B('dcF').value }) });
            B('dcOut').innerHTML = `<div class="msg ai"><pre dir="ltr">${esc(r.content.slice(0, 3000))}</pre></div><div class="mactions"><button id="dcDl">⬇️ تنزيل</button></div>`;
            B('dcDl').onclick = () => dl((r.title || 'doc') + '.' + r.format, r.content);
          } catch (e) { B('dcOut').innerHTML = '<div class="empty">❌ ' + esc(e.message) + '</div>'; } };
        B('cmpGo').onclick = async () => { B('cmpOut').innerHTML = '<div class="skel"></div>';
          try { const r = await api('/api/compare-docs', { method: 'POST', body: JSON.stringify({ textA: B('cmpA').value, textB: B('cmpB').value }) }); B('cmpOut').innerHTML = `<div class="msg ai">${md(r.comparison)}</div>`; }
          catch (e) { B('cmpOut').innerHTML = '<div class="empty">❌ ' + esc(e.message) + '</div>'; } }; } },
    sandbox: { h: '🧪 Safe Sandbox — JavaScript معزول (3 ثوانٍ، بلا شبكة/أسرار)', b: `${row('<select id="sbL"><option value="javascript">JavaScript</option><option value="python">Python</option></select><button class="btn primary" id="sbGo">▶️ تشغيل</button>')}<textarea id="sbC" dir="ltr" style="min-height:120px;font-family:monospace">console.log("hello MODYX"); [1,2,3].map(x=>x*2)</textarea><div id="sbOut"></div>`,
      w() { B('sbGo').onclick = async () => { try { const r = await api('/api/sandbox', { method: 'POST', body: JSON.stringify({ language: B('sbL').value, code: B('sbC').value }) });
          B('sbOut').innerHTML = r.ok ? `<div class="msg ai"><b>Output (${r.ms}ms):</b><pre dir="ltr">${esc(r.output || '(فارغ)')}</pre></div>` : `<div class="empty">❌ ${esc(r.error || '')}<pre dir="ltr">${esc(r.output || '')}</pre></div>`;
        } catch (e) { B('sbOut').innerHTML = '<div class="empty">ℹ️ ' + esc(e.message) + '</div>'; } }; } },
    prompts: { h: '📚 Prompt Library — حفظ/نسخ/تحسين/تقييم', b: `${row(inp('prS', 'بحث...') + '<button class="btn" id="prFind">🔍</button><button class="btn primary" id="prOpt">✨ محسّن البرومبت</button>')}<div id="prL"></div><div id="prV"></div>`,
      async w() { const load = async (q = '') => { const j = await api('/api/prompts' + (q ? '?q=' + encodeURIComponent(q) : '')); B('prL').innerHTML = j.prompts.map(p => `<div class="filechip">📚 <b>${esc(p.title)}</b> <small>[${esc(p.category)}] ${p.fav ? '⭐' : ''} ${esc(p.visibility)}</small><button data-use-p="${esc(p.body)}">📩 استخدام</button><button data-vers="${p.id}">🕘 نسخ (${''})</button><button data-fav-p="${p.id}">⭐</button><button data-del-p="${p.id}">🗑️</button></div>`).join('') || '<div class="empty">لا قوالب — احفظ من هنا: العنوان + النص</div>';
          B('prL').querySelectorAll('[data-use-p]').forEach(x => x.onclick = () => { document.getElementById('prompt').value = x.dataset.useP; showTab('chat'); });
          B('prL').querySelectorAll('[data-vers]').forEach(x => x.onclick = async () => { const v = await api('/api/prompts/' + x.dataset.vers + '/versions'); B('prV').innerHTML = '<b>الإصدارات:</b>' + v.versions.map(z => `<div class="filechip">v${z.v} <small>${esc(z.body.slice(0, 60))}</small><button data-res="${x.dataset.vers}" data-v="${z.v}">↩️ استعادة</button></div>`).join('');
            B('prV').querySelectorAll('[data-res]').forEach(y => y.onclick = async () => { await api('/api/prompts/' + y.dataset.res + '/restore', { method: 'POST', body: JSON.stringify({ v: Number(y.dataset.v) }) }); toast('تمت الاستعادة ↩️'); load(); }); });
          B('prL').querySelectorAll('[data-fav-p]').forEach(x => x.onclick = async () => { await api('/api/prompts/' + x.dataset.favP, { method: 'PUT', body: JSON.stringify({ fav: 1 }) }); load(); });
          B('prL').querySelectorAll('[data-del-p]').forEach(x => x.onclick = async () => { await api('/api/prompts/' + x.dataset.delP, { method: 'DELETE' }); load(); }); };
        B('prFind').onclick = () => load(B('prS').value);
        B('prOpt').onclick = async () => { const p = B('prS').value; if (!p) return toast('اكتب البرومبت في البحث أولًا'); const r = await api('/api/prompts/optimize', { method: 'POST', body: JSON.stringify({ prompt: p }) }); B('prV').innerHTML = `<div class="msg ai"><b>المحسّن:</b><br>${md(r.optimized)}</div>`; };
        load(); } },
    compare: { h: '⚖️ Model Comparison', b: `${row(inp('cpQ', 'سؤال للمقارنة...') + '<button class="btn primary" id="cpGo">⚖️ قارن</button>')}<div id="cpOut"></div>`,
      w() { B('cpGo').onclick = async () => { B('cpOut').innerHTML = '<div class="skel"></div>'; const r = await api('/api/compare', { method: 'POST', body: JSON.stringify({ content: B('cpQ').value }) }); B('cpOut').innerHTML = `<small>${esc(r.note)}</small>` + r.results.map(x => `<div class="card" style="margin:6px 0"><b>${esc(x.model)}</b> <small>⏱️ ${x.latency_ms}ms</small><p>${esc(x.response.slice(0, 600))}</p></div>`).join(''); }; } },
    github: { h: '🐙 GitHub — ربط آمن بتوكن قراءة', b: `<div id="ghS"></div><div id="ghB"></div>`,
      async w() { const st = async () => { const j = await api('/api/github/status'); B('ghS').innerHTML = j.connected ? `<div class="filechip">✅ متصل: ${esc(j.login)} <button id="ghOff">فصل</button></div>` : `${row(inp('ghT', 'الصق PAT (قراءة فقط)...') + '<button class="btn primary" id="ghOn">ربط</button>')}`;
          const on = B('ghOn'); if (on) on.onclick = async () => { await api('/api/github/connect', { method: 'POST', body: JSON.stringify({ token: B('ghT').value }) }); st(); };
          const off = B('ghOff'); if (off) off.onclick = async () => { await api('/api/github/disconnect', { method: 'POST' }); st(); }; };
        await st();
        B('ghB').innerHTML = `${row(inp('ghR', 'owner/repo') + '<button class="btn" id="ghAn">🔍 تحليل المستودع</button>')}<div id="ghOut"></div>`;
        B('ghAn').onclick = async () => { try { const [o, r] = B('ghR').value.split('/'); const j = await api(`/api/github/repo?owner=${o}&repo=${r}`); B('ghOut').innerHTML = `<div class="msg ai">${md(j.analysis)}</div><small>⭐ ${j.repo.stars} · ${esc(j.repo.lang || '')}</small>`; } catch (e) { B('ghOut').innerHTML = '<div class="empty">❌ ' + esc(e.message) + '</div>'; } }; } },
    apikeys: { h: '🔑 MODYX API — مفاتيح + استخدام + Docs', b: `${row(inp('akN', 'اسم المفتاح') + '<button class="btn primary" id="akAdd">＋ إنشاء</button><button class="btn" id="akDocs">📖 Docs</button>')}<div id="akL"></div><div id="akD"></div>`,
      async w() { const load = async () => { const j = await api('/api/apikeys'); B('akL').innerHTML = j.keys.map(k => `<div class="filechip">🔑 ${esc(k.name)} <code>${esc(k.prefix)}</code> [${k.status}] يومي:${k.daily_limit} شهري:${k.monthly_limit} <button data-uak="${k.id}">📊</button><button data-rak="${k.id}">🚫</button></div>`).join('') || '<div class="empty">لا مفاتيح</div>';
          B('akL').querySelectorAll('[data-rak]').forEach(x => x.onclick = async () => { if (confirm('سحب المفتاح؟')) { await api('/api/apikeys/' + x.dataset.rak + '/revoke', { method: 'POST' }); load(); } });
          B('akL').querySelectorAll('[data-uak]').forEach(x => x.onclick = async () => { const u = await api('/api/apikeys/' + x.dataset.uak + '/usage'); B('akD').innerHTML = '<small>' + u.usage.map(z => `${z.day}: ${z.c}`).join(' · ') + '</small>'; }); };
        B('akAdd').onclick = async () => { const r = await api('/api/apikeys', { method: 'POST', body: JSON.stringify({ name: B('akN').value || 'key' }) }); B('akD').innerHTML = `<div class="wcard">⚠️ انسخ الآن (لن يظهر مجددًا):<br><code dir="ltr">${esc(r.secret)}</code></div>`; load(); };
        B('akDocs').onclick = async () => { const d = await api('/api/docs'); B('akD').innerHTML = `<div class="msg ai"><b>${esc(d.title)}</b><br>${d.quickstart.map(x => '• ' + esc(x)).join('<br>')}<br><br><b>SDK:</b><br>${d.sdks.map(s => `• <a href="/sdk/${s.split('/').pop()}" download>${esc(s)}</a>`).join('<br>')}</div>`; };
        load(); } },
    webhooks: { h: '🪝 Webhooks — إنشاء + اختبار + سجل توصيل', b: `${row(inp('whU', 'https://...') + '<button class="btn primary" id="whAdd">＋</button>')}<div id="whL"></div><div id="whD"></div>`,
      async w() { const load = async () => { const j = await api('/api/webhooks'); B('whL').innerHTML = j.webhooks.map(x => `<div class="filechip">🪝 ${esc(x.url.slice(0, 50))} ${x.enabled ? '🟢' : '⚪'}<button data-test-w="${x.id}">📨 اختبار</button><button data-log-w="${x.id}">📜 السجل</button><button data-del-w="${x.id}">🗑️</button></div>`).join('') || '<div class="empty">لا Webhooks</div>';
          B('whL').querySelectorAll('[data-test-w]').forEach(y => y.onclick = async () => { const r = await api('/api/webhooks/' + y.dataset.testW + '/test', { method: 'POST' }); toast(r.ok ? 'وصل الاختبار ✅' : 'فشل التوصيل (سُجلت المحاولة)'); });
          B('whL').querySelectorAll('[data-log-w]').forEach(y => y.onclick = async () => { const d = await api('/api/webhooks/' + y.dataset.logW + '/deliveries'); B('whD').innerHTML = d.deliveries.map(z => `<div class="filechip">${esc(z.event)} → ${z.code} ${z.ok ? '✅' : '❌'} (محاولات:${z.attempts})</div>`).join('') || '—'; });
          B('whL').querySelectorAll('[data-del-w]').forEach(y => y.onclick = async () => { await api('/api/webhooks/' + y.dataset.delW, { method: 'DELETE' }); load(); }); };
        B('whAdd').onclick = async () => { await api('/api/webhooks', { method: 'POST', body: JSON.stringify({ url: B('whU').value, events: ['*'] }) }); B('whU').value = ''; load(); }; load(); } },
    market: { h: '🏪 AI Marketplace — نشر + تقييم', b: '<div id="mkL"></div>',
      async w() { const j = await api('/api/market'); B('mkL').innerHTML = j.items.map(i => `<div class="card" style="margin:6px 0"><b>${esc(i.title)}</b> <small>[${esc(i.kind)}] ⭐ ${Number(i.rating?.a || 0).toFixed(1)} (${i.rating?.c || 0}) — ${esc(i.owner)}</small><p>${esc((i.body || '').slice(0, 150))}</p><div class="mactions"><button data-rev-m="${i.id}">⭐ قيّم</button><button data-rep-m="${i.id}">🚩 بلاغ</button></div></div>`).join('') || '<div class="empty">السوق فارغ — انشر من مساعديك أو قوالبك</div>';
        B('mkL').querySelectorAll('[data-rev-m]').forEach(x => x.onclick = async () => { const r = prompt('تقييم 1-5:'); if (!r) return; try { await api('/api/market/' + x.dataset.revM + '/review', { method: 'POST', body: JSON.stringify({ rating: Number(r) }) }); toast('شكرًا ⭐'); } catch (e) { toast(e.message); } });
        B('mkL').querySelectorAll('[data-rep-m]').forEach(x => x.onclick = async () => { const r = prompt('سبب البلاغ:'); if (r) { await api('/api/market/' + x.dataset.repM + '/report', { method: 'POST', body: JSON.stringify({ reason: r }) }); toast('تم الإرسال'); } }); } },
    teams: { h: '👥 Team Workspace — فرق وأدوار ومحادثات مشتركة', b: `${row(inp('tmN', 'فريق جديد...') + '<button class="btn primary" id="tmAdd">＋</button>')}<div id="tmL"></div>`,
      async w() { const load = async () => { const j = await api('/api/teams'); B('tmL').innerHTML = j.teams.map(t => `<div class="card" style="margin:6px 0"><b>${esc(t.name)}</b> <small>دورك: ${esc(t.role)}</small><div class="prow"><input placeholder="بريد العضو..." id="em-${t.id}"><select id="rl-${t.id}"><option value="member">عضو</option><option value="admin">مشرف</option><option value="viewer">مشاهد</option></select><button class="btn" data-inv="${t.id}">＋ دعوة</button><button class="btn" data-tc="${t.id}">💬 محادثات الفريق</button></div><div id="tc-${t.id}"></div></div>`).join('') || '<div class="empty">لا فرق — أنشئ فريقًا وادعُ بالبريد</div>';
          B('tmL').querySelectorAll('[data-inv]').forEach(x => x.onclick = async () => { try { await api('/api/teams/' + x.dataset.inv + '/members', { method: 'POST', body: JSON.stringify({ email: document.getElementById('em-' + x.dataset.inv).value, role: document.getElementById('rl-' + x.dataset.inv).value }) }); toast('تمت الدعوة ✅'); } catch (e) { toast(e.message); } });
          B('tmL').querySelectorAll('[data-tc]').forEach(x => x.onclick = async () => { const c = await api('/api/teams/' + x.dataset.tc + '/chats'); document.getElementById('tc-' + x.dataset.tc).innerHTML = c.chats.map(z => `<div class="filechip">💬 ${esc(z.title)}</div>`).join('') || 'لا محادثات مشتركة'; }); };
        B('tmAdd').onclick = async () => { await api('/api/teams', { method: 'POST', body: JSON.stringify({ name: B('tmN').value }) }); B('tmN').value = ''; load(); }; load(); } },
    credits: { h: '🪙 Credits + Referral', b: '<div id="crB"></div>',
      async w() { const c = await api('/api/credits/me'); const r = await api('/api/referral/me');
        B('crB').innerHTML = `<div class="card"><b>رصيدك: ${c.balance} 🪙</b><br><small>كود الإحالة: <code dir="ltr">${esc(r.code)}</code> — دعوات: ${r.invites} ناجحة: ${r.successful} — المكافأة: ${r.reward} 🪙 للطرفين</small></div><h4>السجل</h4>` + (c.history.map(h => `<div class="filechip">${h.amount > 0 ? '+' : ''}${h.amount} — ${esc(h.reason)} <small>${esc(h.created_at)}</small></div>`).join('') || '—'); } },
    stats: { h: '📊 إحصائيات استخدامك', b: '<div id="stB"></div>',
      async w() { const s = await api('/api/stats/me');
        const mx = Math.max(1, ...s.days.map(d => d.messages || 0));
        const bars = s.days.map(d => `<div style="display:flex;align-items:center;gap:6px;font-size:12px"><small style="width:64px">${esc(d.day.slice(5))}</small><i style="display:block;height:12px;border-radius:6px;background:linear-gradient(90deg,var(--neon),var(--neon2));width:${Math.round((d.messages || 0) / mx * 100)}%"></i><small>${d.messages || 0}</small></div>`).join('');
        const modes = Object.entries(s.byMode).map(([k, v]) => `${esc(k)}: ${v}`).join(' · ') || '—';
        const pk = s.hours.indexOf(Math.max(...s.hours));
        B('stB').innerHTML = `<div class="card"><b>إجمالي رسائلك (14 يوم): ${s.total} 💬</b><br><small>أنشط ساعة: ${pk}:00</small><div style="margin:8px 0">${bars}</div><small>حسب النوع: ${modes}</small></div>`; } },
    telegram: { h: '✈️ بوت Telegram — حسابك + المجموعات', b: '<div id="tgB"></div>',
      async w() { const s = await api('/api/telegram/status');
        B('tgB').innerHTML = s.configured
          ? `<div class="filechip">🤖 @${esc(s.bot?.username || '?')} ${s.linked ? '— مربوط ✅ (' + esc(s.linked.chat_id) + ')' : '— غير مربوط'}</div>
             <div class="prow"><button class="btn primary" id="tgCode">🔑 كود الربط</button><button class="btn" id="tgOff">فصل</button></div>
             <small>في المجموعات: أضف البوت واذكره (@${esc(s.bot?.username || '?')}) مع سؤالك.</small><div id="tgOut"></div>`
          : `<div class="empty">⚠️ ${esc(s.reason)}<br><small>اطلب من الإدارة: TELEGRAM_BOT_TOKEN + Webhook (تبويب الإدارة).</small></div>`;
        const gc = B('tgCode'); if (gc) gc.onclick = async () => { const j = await api('/api/telegram/code', { method: 'POST' }); B('tgOut').innerHTML = `<div class="wcard">كودك (15 دقيقة): <b dir="ltr" style="font-size:24px">${esc(j.code)}</b><br><small>أرسل <code dir="ltr">/link ${esc(j.code)}</code> للبوت</small></div>`; };
        const off = B('tgOff'); if (off) off.onclick = async () => { await api('/api/telegram/disconnect', { method: 'POST' }); toast('تم الفصل'); }; } },
    admin: { h: '🛡️ Pro Admin — حالة/أعلام/نسخ/إيرادات/فيدباك/إعلانات/مدفوعات', b: `<div class="prow"><button class="btn" id="axSt">📊 الحالة</button><button class="btn" id="axFl">🚩 الأعلام</button><button class="btn" id="axBk">💾 نسخ احتياطي</button><button class="btn" id="axRv">💰 الإيرادات</button><button class="btn" id="axFb">💬 الفيدباك</button><button class="btn" id="axAds">📢 الإعلانات</button><button class="btn" id="axPay">💳 المدفوعات</button><button class="btn" id="axTg">✈️ Telegram</button></div><div id="axOut"></div>`,
      async w() {
        B('axSt').onclick = async () => { const s = await api('/api/admin/status'); B('axOut').innerHTML = Object.entries(s.status).map(([k, v]) => `<div class="filechip">${v === 'operational' ? '🟢' : v === 'degraded' ? '🟡' : '🔴'} <b>${esc(k)}</b>: ${esc(v)}</div>`).join('') + `<small>مزود: ${esc(s.provider)} (${esc(s.mode)})</small>`; };
        B('axFl').onclick = async () => { const f = await api('/api/admin/flags'); B('axOut').innerHTML = f.flags.map(x => `<div class="filechip">🚩 ${esc(x.key)} <button data-fl="${esc(x.key)}" data-e="${x.enabled}">${x.enabled ? 'إيقاف' : 'تشغيل'}</button></div>`).join('');
          B('axOut').querySelectorAll('[data-fl]').forEach(y => y.onclick = async () => { await api('/api/admin/flags', { method: 'PUT', body: JSON.stringify({ [y.dataset.fl]: y.dataset.e === '1' ? 0 : 1 }) }); toast('تم ✅'); }); };
        B('axBk').onclick = async () => { const r = await api('/api/admin/backups', { method: 'POST' }); toast('تم النسخ 💾 (' + (r.size / 1024).toFixed(0) + 'KB)'); };
        B('axRv').onclick = async () => { const v = await api('/api/admin/revenue'); B('axOut').innerHTML = `<div class="msg ai">اشتراكات: ${v.subs.map(s => s.status + ':' + s.c).join('، ')}<br>كريدت مُصدر: ${v.credits_issued} · مستهلك: ${v.credits_spent}<br>نشطون اليوم: ${v.active_today}</div>`; };
        B('axFb').onclick = async () => { const f = await api('/api/admin/feedback'); B('axOut').innerHTML = f.feedback.map(x => `<div class="filechip">${x.rating === 1 ? '👍' : '👎'} ${esc(x.comment || '')} <small>${esc(x.model)} · ${esc(x.created_at)}</small></div>`).join('') || 'لا فيدباك'; };
        B('axAds').onclick = async () => { const a = await api('/api/admin/ads');
          B('axOut').innerHTML = row(inp('adT', 'عنوان الإعلان') + inp('adL', 'رابط https://...') + '<button class="btn primary" id="adAdd">＋</button>') + '<div id="adL"></div>';
          const rl = () => api('/api/admin/ads').then(j => { B('adL').innerHTML = j.ads.map(x => `<div class="filechip">📢 ${esc(x.title)} 👁️${x.impressions} 🖱️${x.clicks} ${x.enabled ? '🟢' : '⚪'}<button data-adt="${x.id}" data-e="${x.enabled}">${x.enabled ? 'إيقاف' : 'تشغيل'}</button><button data-add="${x.id}">🗑️</button></div>`).join('') || 'لا إعلانات';
            B('adL').querySelectorAll('[data-adt]').forEach(y => y.onclick = async () => { await api('/api/admin/ads/' + y.dataset.adt, { method: 'PUT', body: JSON.stringify({ enabled: y.dataset.e === '1' ? 0 : 1 }) }); rl(); });
            B('adL').querySelectorAll('[data-add]').forEach(y => y.onclick = async () => { await api('/api/admin/ads/' + y.dataset.add, { method: 'DELETE' }); rl(); }); });
          B('adAdd').onclick = async () => { await api('/api/admin/ads', { method: 'POST', body: JSON.stringify({ title: B('adT').value, link: B('adL').value }) }); rl(); };
          rl(); };
        B('axPay').onclick = async () => { const p = await api('/api/admin/payments'); B('axOut').innerHTML = p.payments.map(x => `<div class="filechip">💳 ${esc(x.email)} → ${esc(x.plan)} [${esc(x.method)}:${esc(x.tx)}] [${esc(x.status)}]</div>`).join('') || 'لا مدفوعات (الإدارة من تبويب الإدارة الرئيسي)'; };
        B('axTg').onclick = async () => { B('axOut').innerHTML = row(inp('tgUrl', 'https://domain.com/api/telegram/hook?key=SECRET')) + row('<button class="btn primary" id="tgSet">🔗 ضبط Webhook</button>');
          B('tgSet').onclick = async () => { try { const r = await api('/api/admin/telegram/webhook', { method: 'POST', body: JSON.stringify({ url: B('tgUrl').value }) }); toast(r.ok ? 'تم ضبط Webhook ✅' : 'Telegram: ' + (r.desc || 'فشل')); } catch (e) { toast(e.message); } }; }; } },
  };
  function show(tab) {
    const bar = document.getElementById('proTabs');
    const isAdmin = !!sessionStorage.getItem('modyx_admin');
    bar.innerHTML = TABS.filter(([id]) => !ADMIN_ONLY.has(id) || isAdmin).map(([id, t]) => `<button class="btn" data-pt="${id}">${t}</button>`).join('');
    const open = (id) => {
      bar.querySelectorAll('[data-pt]').forEach(x => x.classList.toggle('on', x.dataset.pt === id));
      const R_ = R[id]; document.getElementById('proBody').innerHTML = `<p style="color:var(--muted);font-size:13px">${R_.h}</p>${R_.b}`;
      try { R_.w && R_.w(); } catch (e) { document.getElementById('proBody').innerHTML += '<div class="empty">❌ ' + e.message + '</div>'; }
    };
    bar.querySelectorAll('[data-pt]').forEach(x => x.onclick = () => open(x.dataset.pt));
    open(TABS.some(([id]) => id === tab) ? tab : 'research');
  }
  return { show };
})();
